"""
sync_runner.py — un ciclo di sincronizzazione (iscrizioni + feed).

Isolato da SyncScheduler (in sync.py) perché insieme ai 5 metodi della classe
si sarebbe superato il tetto di 5 funzioni per file (vedi CLAUDE.md).
"""
import time
from typing import Callable

from auth import feed_subscriptions, subscriptions_sync


async def esegui_sync(scheduler, state, ydl_opts_fn: Callable):
    """Rinnova le iscrizioni e ricostruisce la cache del feed iscrizioni."""
    scheduler._status = "syncing"
    try:
        await subscriptions_sync.sync_subscriptions(state)
        n_canali = len(subscriptions_sync.get_subscriptions(state))
        print(f"[sync] Iscrizioni aggiornate — {n_canali} canali")
        # Scansione completa (tutti i canali) del feed 'Iscrizioni': lenta
        # (una richiesta per canale, parallelizzata), per questo gira solo
        # qui in background e non ad ogni caricamento della pagina.
        feed = await feed_subscriptions.refresh_subscriptions_feed(state, ydl_opts_fn)
        print(f"[sync] Feed iscrizioni aggiornato — {len(feed)} video")
        scheduler._last_sync = time.time()
        scheduler._status = "ok"
        scheduler._last_error = ""
    except Exception as e:
        scheduler._status = "error"
        scheduler._last_error = str(e)
        print(f"[sync] Errore sync: {e}")
