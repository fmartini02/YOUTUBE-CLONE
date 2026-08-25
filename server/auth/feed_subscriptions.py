"""feed_subscriptions.py — feed 'Iscrizioni': cookie reali, o fallback dai canali iscritti."""
import asyncio
import time

from auth.config import COOKIE_FEED_CACHE_TTL
from auth.cookie_session import crea_ydl
from auth.cookies import get_cookie_path
from auth.mapping import is_video_entry, map_video_entry
from auth.storage import SUBS_FEED_CACHE_FILE, _scrivi_json


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


async def get_personalized_feed(state, ydl_opts_base_fn) -> list:
    """
    Feed 'Iscrizioni': cookie → feed reale di YouTube (ordine loro), tenuto in
    cache in memoria per qualche minuto; altrimenti la cache su disco
    aggiornata in background da tutti i canali iscritti (vedi
    refresh_subscriptions_feed), o un fetch a caldo ridotto se la cache è
    ancora vuota (es. subito dopo il primo login).
    """
    cookie_path = get_cookie_path()
    if cookie_path:
        if state.cookie_feed_cache and time.time() - state.cookie_feed_cache_at < COOKIE_FEED_CACHE_TTL:
            return state.cookie_feed_cache
        results = await _fetch_cookie_feed(ydl_opts_base_fn, cookie_path)
        if results:
            state.cookie_feed_cache = results
            state.cookie_feed_cache_at = time.time()
            return results
        if results is None and state.cookie_feed_cache:
            return state.cookie_feed_cache  # stale, ma meglio di niente

    if state.subs_feed_cache:
        return state.subs_feed_cache
    if state.subs:
        # Cache ancora vuota (es. server appena avviato): fetch a caldo ma
        # ridotto per non far aspettare troppo l'utente.
        return await refresh_subscriptions_feed(state, ydl_opts_base_fn, max_channels=15)
    return []


async def _fetch_channel_latest(ch: dict, ydl_opts_base_fn, sem: asyncio.Semaphore) -> list:
    """Ultimi video di UN canale iscritto, con logo già allegato (gratis, viene da sync_subscriptions)."""
    if not ch.get("id"):
        return []
    async with sem:
        try:
            opts = {**ydl_opts_base_fn(), "playlistend": 8}
            loop = asyncio.get_event_loop()

            def _extract():
                with crea_ydl(opts) as ydl:
                    return ydl.extract_info(f"https://www.youtube.com/channel/{ch['id']}/videos", download=False)

            info = await loop.run_in_executor(None, _extract)
            return [
                {**map_video_entry(e), "channel": ch["name"], "channel_id": ch["id"], "avatar": ch.get("thumbnail")}
                for e in (info or {}).get("entries", []) or [] if is_video_entry(e)
            ]
        except Exception:
            return []


async def refresh_subscriptions_feed(state, ydl_opts_base_fn, max_channels=None) -> list:
    """
    Scarica gli ultimi video di TUTTI i canali iscritti in parallelo (bounded
    a 10 richieste contemporanee) e li mette in cache ordinati per data.
    Chiamata ogni ora da sync_runner.py.
    """
    channels = state.subs if max_channels is None else state.subs[:max_channels]
    sem = asyncio.Semaphore(10)
    results_lists = await asyncio.gather(*[
        _fetch_channel_latest(ch, ydl_opts_base_fn, sem) for ch in channels
    ])
    results = [v for sub in results_lists for v in sub]
    results.sort(key=lambda x: x.get("published") or "0", reverse=True)

    if max_channels is None:
        # Solo la scansione completa (background) aggiorna la cache persistente.
        state.subs_feed_cache = results[:300]
        _scrivi_json(SUBS_FEED_CACHE_FILE, state.subs_feed_cache)

    return results[:300]
