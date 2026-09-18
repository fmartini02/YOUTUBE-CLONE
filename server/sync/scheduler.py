"""
scheduler.py — Sincronizzazione automatica in background
Ogni ora: rinnova token + aggiorna iscrizioni (richiede OAuth). Ogni pochi
minuti, indipendentemente dall'OAuth: tiene caldo il feed cookie 'Iscrizioni'
(vedi COOKIE_FEED_WARM_INTERVAL) così l'apertura della pagina trova quasi
sempre una cache pronta invece di aspettare un'estrazione intera. La logica
di un ciclo di sync completo sta in runner.py (qui supererebbe le 5 funzioni
per file, vedi CLAUDE.md).
"""
import asyncio
from typing import Callable

from auth import feed_subscriptions, oauth_status
from auth.config import COOKIE_FEED_WARM_INTERVAL
from auth.cookies import get_cookie_path
from sync.runner import esegui_sync

SYNC_INTERVAL = 3600  # 1 ora


class SyncScheduler:
    def __init__(self):
        self._task = None
        self._last_sync: float = 0
        self._status = "idle"  # idle | syncing | ok | error
        self._last_error: str = ""

    def start(self, state, ydl_opts_fn: Callable):
        """Avvia il loop di sync in background."""
        if self._task and not self._task.done():
            return
        self._task = asyncio.create_task(self._loop(state, ydl_opts_fn))

    async def _loop(self, state, ydl_opts_fn):
        elapsed_since_full = SYNC_INTERVAL  # forza il giro completo al primo avvio
        while True:
            if elapsed_since_full >= SYNC_INTERVAL and oauth_status.is_authenticated(state):
                await esegui_sync(self, state, ydl_opts_fn)
                elapsed_since_full = 0
            cookie_path = get_cookie_path()
            if cookie_path:
                await feed_subscriptions.refresh_cookie_feed(state, ydl_opts_fn, cookie_path)
            await asyncio.sleep(COOKIE_FEED_WARM_INTERVAL)
            elapsed_since_full += COOKIE_FEED_WARM_INTERVAL

    def get_status(self) -> dict:
        return {
            "status": self._status,
            "last_sync": self._last_sync,
            "last_error": self._last_error,
        }

    async def force_sync(self, state, ydl_opts_fn):
        """Sync immediato su richiesta."""
        await esegui_sync(self, state, ydl_opts_fn)


scheduler = SyncScheduler()
