"""
sync.py — Sincronizzazione automatica in background
Ogni ora: rinnova token + aggiorna iscrizioni
"""

import asyncio
import time
from typing import Callable

SYNC_INTERVAL = 3600  # 1 ora


class SyncScheduler:
    def __init__(self):
        self._task = None
        self._last_sync: float = 0
        self._status = "idle"  # idle | syncing | ok | error
        self._last_error: str = ""

    def start(self, auth_manager, ydl_opts_fn: Callable):
        """Avvia il loop di sync in background."""
        if self._task and not self._task.done():
            return
        self._task = asyncio.create_task(self._loop(auth_manager, ydl_opts_fn))

    async def _loop(self, auth_manager, ydl_opts_fn):
        while True:
            if auth_manager.is_authenticated():
                await self._run_sync(auth_manager, ydl_opts_fn)
            await asyncio.sleep(SYNC_INTERVAL)

    async def _run_sync(self, auth_manager, ydl_opts_fn):
        self._status = "syncing"
        try:
            await auth_manager.sync_subscriptions()
            print(f"[sync] Iscrizioni aggiornate — {len(auth_manager.get_subscriptions())} canali")
            # Scansione completa (tutti i canali) del feed 'Iscrizioni': lenta
            # (una richiesta per canale, parallelizzata), per questo gira solo
            # qui in background e non ad ogni caricamento della pagina.
            feed = await auth_manager.refresh_subscriptions_feed(ydl_opts_fn)
            print(f"[sync] Feed iscrizioni aggiornato — {len(feed)} video")
            self._last_sync = time.time()
            self._status = "ok"
            self._last_error = ""
        except Exception as e:
            self._status = "error"
            self._last_error = str(e)
            print(f"[sync] Errore sync: {e}")

    def get_status(self) -> dict:
        return {
            "status": self._status,
            "last_sync": self._last_sync,
            "last_error": self._last_error,
        }

    async def force_sync(self, auth_manager, ydl_opts_fn):
        """Sync immediato su richiesta."""
        await self._run_sync(auth_manager, ydl_opts_fn)


scheduler = SyncScheduler()
