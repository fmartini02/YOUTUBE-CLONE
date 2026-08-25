"""
sync.py — Sincronizzazione automatica in background
Ogni ora: rinnova token + aggiorna iscrizioni. La logica di un singolo ciclo
sta in sync_runner.py (qui supererebbe le 5 funzioni per file, vedi CLAUDE.md).
"""
import asyncio
from typing import Callable

from auth import oauth_status
from sync_runner import esegui_sync

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
        while True:
            if oauth_status.is_authenticated(state):
                await esegui_sync(self, state, ydl_opts_fn)
            await asyncio.sleep(SYNC_INTERVAL)

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
