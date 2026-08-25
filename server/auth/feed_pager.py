"""
feed_pager.py — paginazione pigra condivisa da home, correlati e canale
(vedi lazy_feed.LazyFeed).
"""
import asyncio
import time
from dataclasses import dataclass
from typing import Optional

from auth.config import FEED_CACHE_TTL
from auth.feed_cache import drop_feed, pota_lock, remember_feed
from auth.lazy_feed import LazyFeed


@dataclass
class FeedPageRequest:
    """
    Parametri di una pagina di feed, raggruppati in un solo oggetto perché
    erano più di 5 argomenti posizionali (vedi CLAUDE.md).

    `key` identifica il feed da riprendere: "home" per le raccomandazioni,
    "related:<id>" per il mix di un video, "channel:<id>" per la scheda video
    di un canale. Con `with_info` la risposta porta anche `info`, i metadati
    della lista. Con `refill` il feed si riapre invece di finire (solo la
    home). `escludi` è un id da non far entrare nella pagina (il video di
    partenza, nei correlati).
    """
    key: str
    url: str
    offset: int
    limit: int
    opts: dict
    chunk: int
    cap: int
    with_info: bool = False
    refill: bool = False
    escludi: Optional[str] = None


async def _open_lazy_feed(req: FeedPageRequest):
    """Apre il feed (prima richiesta a YouTube). None se fallisce."""
    try:
        # extract_info è bloccante: in un thread separato, altrimenti
        # fermerebbe l'intero event loop di FastAPI per tutta la durata
        # dell'estrazione.
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, lambda: LazyFeed(req.url, req.opts, req.refill, req.escludi))
    except Exception as e:
        print(f"[auth] Errore apertura feed {req.url}: {e}")
        return None


async def _estendi_fino_a(feed, needed: int, cap: int, chunk: int, key: str):
    """Estende il feed finché non copre `needed` elementi (o si esaurisce, o raggiunge `cap`)."""
    loop = asyncio.get_event_loop()
    while len(feed.items) < needed and not feed.exhausted and len(feed.items) < cap:
        before = len(feed.items)
        try:
            await loop.run_in_executor(None, feed.extend, chunk)
        except Exception as e:
            print(f"[auth] Errore estensione feed '{key}': {e}")
            feed.exhausted = True
            break
        if len(feed.items) == before:
            # Nessun progresso pur non essendo esaurito: evita di ciclare
            # all'infinito su un feed che non avanza più.
            feed.exhausted = True
            break


async def _lazy_page_locked(state, req: FeedPageRequest) -> dict:
    """Corpo di lazy_page, eseguito con il lock del feed già preso."""
    feed = state.feeds.get(req.key)
    # Il TTL vale solo a inizio scorrimento: ricreare il feed a metà
    # paginazione ri-scaricherebbe centinaia di video con un ordine diverso.
    scaduto = feed is not None and req.offset == 0 and time.time() - feed.created_at > FEED_CACHE_TTL
    if feed is None or scaduto:
        if feed is not None:
            feed.close()
            state.feeds.pop(req.key, None)
        feed = await _open_lazy_feed(req)
        if feed is None:
            vuoto = {"results": [], "total": 0, "has_more": False}
            return {**vuoto, "info": {}} if req.with_info else vuoto
    remember_feed(state, req.key, feed)

    await _estendi_fino_a(feed, req.offset + req.limit, req.cap, req.chunk, req.key)

    items = feed.items
    # Un feed che non ha prodotto NIENTE non va tenuto in cache: è uno stato
    # di errore, non un risultato — altrimenti ogni richiesta successiva
    # risponderebbe "vuoto" fino alla scadenza del TTL.
    if not items:
        drop_feed(state, req.key)

    page = {
        "results": items[req.offset:req.offset + req.limit],
        "total": len(items),
        "has_more": ((not feed.exhausted) and len(items) < req.cap) or req.offset + req.limit < len(items),
    }
    if req.with_info:
        page["info"] = feed.info
    return page


async def lazy_page(state, req: FeedPageRequest) -> dict:
    """
    Una pagina di un feed estratto pigramente, tenendo vivo il generatore di
    yt-dlp fra una richiesta e l'altra (vedi lazy_feed.LazyFeed). I feed
    aperti restano in una piccola cache LRU (vedi feed_cache) perché ognuno
    tiene aperta un'istanza di yt-dlp.
    """
    lock = state.feed_locks.setdefault(req.key, asyncio.Lock())
    # Un solo estrattore alla volta per feed: il generatore di yt-dlp non è
    # thread-safe e due scroll paralleli lo corromperebbero.
    try:
        async with lock:
            return await _lazy_page_locked(state, req)
    finally:
        # FUORI dal `with`, quando il lock è di nuovo libero: senza potatura
        # la mappa dei lock cresce di una voce per ogni video di cui si sono
        # chiesti i correlati e non si svuota mai.
        pota_lock(state, req.key)
