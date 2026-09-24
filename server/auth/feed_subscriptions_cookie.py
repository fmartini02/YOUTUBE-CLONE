"""
feed_subscriptions_cookie.py — feed 'Iscrizioni' letto coi cookie, a blocchi.

Scaricare in un colpo solo i SUBS_FEED_MAX video del feed voleva dire
aspettare la pagina di YouTube più 2-3 richieste di continuazione in fila
prima di mostrare qualcosa. Qui il feed si scarica con LazyFeed in un task
in background che pubblica ogni blocco appena arriva: la pagina aspetta solo
il primo (SUBS_FEED_FIRST video), il resto si riempie mentre la si guarda.

Separato da feed_subscriptions.py per la regola delle 5 funzioni per file.
"""
import asyncio
import time

from auth.config import COOKIE_FEED_CACHE_TTL, FEED_CHUNK, SUBS_FEED_FIRST, SUBS_FEED_MAX
from auth.lazy_feed import LazyFeed
from auth.storage import COOKIE_FEED_CACHE_FILE, _scrivi_json

SUBS_FEED_URL = "https://www.youtube.com/feed/subscriptions"


def _pubblica(state, items: list, gen: int, completo: bool) -> bool:
    """
    Mette in cache i video arrivati finora. False se la cache è stata
    invalidata nel frattempo (iscrizione, cookie nuovi: `cookie_feed_gen` è
    cambiato) — allora il task si ferma, la sua è la lista di prima.

    Un blocco intermedio non sostituisce una lista più lunga: quando si
    aggiorna in background una copia vecchia da 100 video, chi sta scorrendo
    non deve vedersela accorciare a 20. Solo la lista finale va su disco.
    """
    if gen != state.cookie_feed_gen:
        return False
    if not completo and len(items) <= len(state.cookie_feed_cache):
        return True
    state.cookie_feed_cache = list(items)
    state.cookie_feed_cache_at = time.time() if items else 0
    state.cookie_feed_parziale = not completo
    if completo:
        _scrivi_json(COOKIE_FEED_CACHE_FILE, {"at": state.cookie_feed_cache_at, "results": state.cookie_feed_cache})
    return True


async def _aggiorna_feed_cookie(state, ydl_opts_base_fn, cookie_path, gen):
    """
    Il task di scaricamento: apre il feed e lo estende a blocchi fino a
    SUBS_FEED_MAX, pubblicando ogni blocco. `gen` lo legge chi CREA il task:
    letto qui dentro, un'invalidazione fra la creazione e il primo passo del
    task passerebbe inosservata.

    Se l'estrazione fallisce la copia che c'era resta; un feed vuoto (sessione
    scaduta) invece la svuota, e la pagina ripiega sulla cache dei canali.
    """
    loop = asyncio.get_running_loop()
    opts = {**ydl_opts_base_fn(), "cookiefile": cookie_path}
    feed = None
    try:
        # LazyFeed e extend() sono bloccanti: sempre nell'executor.
        feed = await loop.run_in_executor(None, LazyFeed, SUBS_FEED_URL, opts)
        blocco = SUBS_FEED_FIRST
        while not feed.exhausted and len(feed.items) < SUBS_FEED_MAX:
            await loop.run_in_executor(None, feed.extend, min(blocco, SUBS_FEED_MAX - len(feed.items)))
            if not _pubblica(state, feed.items, gen, completo=False):
                return
            blocco = FEED_CHUNK
        _pubblica(state, feed.items, gen, completo=True)
    except Exception as e:
        print(f"[auth] Cookie feed error: {e}")
        if gen == state.cookie_feed_gen:
            # Quel che è arrivato resta, ma non si aspetta più altro.
            state.cookie_feed_parziale = False
    finally:
        if feed is not None:
            feed.close()


def in_caricamento(state) -> bool:
    """True se la lista in cache è incompleta e altri blocchi stanno arrivando."""
    task = state.cookie_feed_task
    return state.cookie_feed_parziale and task is not None and not task.done()


async def get_cookie_feed(state, ydl_opts_base_fn, cookie_path, needed: int) -> list:
    """
    Feed cookie in stile stale-while-revalidate: se c'è una copia (anche
    scaduta, anche di prima di un riavvio) esce subito, e se è scaduta parte
    un aggiornamento in background — uno alla volta.

    Si aspetta solo quando serve: niente in cache (si attende il primo
    blocco), oppure la lista sta ancora arrivando e non copre i `needed`
    video chiesti da uno scroll (si attende il blocco successivo, invece di
    rispondere vuoto e fermare lo scroll infinito).
    """
    task = state.cookie_feed_task
    in_corso = task is not None and not task.done()
    scaduta = time.time() - state.cookie_feed_cache_at >= COOKIE_FEED_CACHE_TTL
    if not in_corso and (scaduta or not state.cookie_feed_cache):
        task = asyncio.create_task(
            _aggiorna_feed_cookie(state, ydl_opts_base_fn, cookie_path, state.cookie_feed_gen))
        state.cookie_feed_task = task
    # Polling su memoria locale: costa niente, e a differenza di un Event
    # non c'è niente da ricreare o da svegliare quando il task muore.
    while task is not None and not task.done() and (not state.cookie_feed_cache or (
            state.cookie_feed_parziale and len(state.cookie_feed_cache) < needed)):
        await asyncio.sleep(0.2)
    return state.cookie_feed_cache
