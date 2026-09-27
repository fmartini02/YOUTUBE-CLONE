"""
cookie_feed.py — il feed 'Iscrizioni' reale di YouTube (letto coi cookie),
tenuto in memoria e aggiornato in background.

Scaricarlo è un'estrazione yt-dlp di ~5s. Prima la copia durava 5 minuti e,
scaduta, la richiesta successiva aspettava l'estrazione: tornare sulle
Iscrizioni dopo aver guardato un video significava quasi sempre 5s di
"Caricamento iscrizioni...". Oggi:

- la copia vale COOKIE_FEED_CACHE_TTL (30 min); scaduta, la si **serve lo
  stesso** e intanto parte l'aggiornamento in background;
- un ciclo in background (sync/feed_cookie.py) la riscarica da sé allo
  scadere, così di norma nessuna richiesta la trova vecchia;
- si aspetta l'estrazione solo quando la copia non c'è affatto: primo avvio,
  oppure dopo `scade_feed_cookie` (iscrizione, disiscrizione, cookie
  cambiati), dove il feed vecchio sarebbe sbagliato, non solo vecchio;
- un solo aggiornamento alla volta: due estrazioni in parallelo si
  sovrascriverebbero i cookie ruotati a vicenda (vedi crea_ydl).
"""
import asyncio
import time

from auth.config import COOKIE_FEED_CACHE_TTL, COOKIE_FEED_RIPROVA_S
from auth.cookie_session import crea_ydl
from auth.cookies import get_cookie_path
from auth.mapping import is_video_entry, map_video_entry


async def _fetch_cookie_feed(ydl_opts_base_fn, cookie_path):
    """Estrazione del feed 'Iscrizioni' reale di YouTube. None se fallisce."""
    def _estrai():
        opts = {**ydl_opts_base_fn(), "cookiefile": cookie_path, "playlistend": 100}
        with crea_ydl(opts) as ydl:
            return ydl.extract_info("https://www.youtube.com/feed/subscriptions", download=False)
    try:
        loop = asyncio.get_event_loop()
        info = await loop.run_in_executor(None, _estrai)
        return [map_video_entry(e) for e in ((info or {}).get("entries") or []) if is_video_entry(e)]
    except Exception as e:
        print(f"[auth] Cookie feed error: {e}")
        return None


async def _aggiorna(state, ydl_opts_base_fn, gen: int):
    """
    Una riestrazione. Scrive la cache solo se nessuno l'ha fatta scadere nel
    frattempo (`gen`): altrimenti rimetterebbe il feed di prima di
    un'iscrizione o di un cambio di cookie.

    Se fallisce (None, o vuoto: sessione caduta) la copia che c'è resta, e
    `_at` viene spostato perché il prossimo tentativo cada fra
    COOKIE_FEED_RIPROVA_S invece che alla prossima pagina aperta.
    """
    cookie_path = get_cookie_path()
    if not cookie_path:
        return None
    results = await _fetch_cookie_feed(ydl_opts_base_fn, cookie_path)
    if gen != state.cookie_feed_gen:
        return results
    if results:
        state.cookie_feed_cache = results
        state.cookie_feed_cache_at = time.time()
    else:
        state.cookie_feed_cache_at = time.time() - COOKIE_FEED_CACHE_TTL + COOKIE_FEED_RIPROVA_S
    return results


def aggiorna_in_background(state, ydl_opts_base_fn) -> asyncio.Task:
    """Avvia la riestrazione, o restituisce quella già in corso: mai due insieme."""
    task = state.cookie_feed_task
    if task is None or task.done():
        task = asyncio.create_task(_aggiorna(state, ydl_opts_base_fn, state.cookie_feed_gen))
        state.cookie_feed_task = task
    return task


def scaduta(state) -> bool:
    """La copia in memoria ha superato COOKIE_FEED_CACHE_TTL (o un tentativo fallito aspetta di riprovare)."""
    return time.time() - state.cookie_feed_cache_at >= COOKIE_FEED_CACHE_TTL


async def feed_cookie(state, ydl_opts_base_fn):
    """
    Il feed dei cookie per una richiesta: la copia in memoria se c'è — anche
    scaduta, facendo partire l'aggiornamento senza aspettarlo — altrimenti
    l'estrazione, attesa. None/[] se non c'è niente da mostrare.

    `shield`: se il client chiude la connessione mentre aspetta, la sua
    richiesta viene cancellata, ma l'estrazione condivisa deve arrivare in
    fondo (altre richieste, o il ciclo in background, la stanno aspettando).
    """
    if state.cookie_feed_cache:
        if scaduta(state):
            aggiorna_in_background(state, ydl_opts_base_fn)
        return state.cookie_feed_cache
    return await asyncio.shield(aggiorna_in_background(state, ydl_opts_base_fn))
