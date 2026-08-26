"""startup.py — pulizia una tantum e avvio dello scheduler di sync all'avvio del server."""
import tempfile
from pathlib import Path

from auth.state import state
from auth.storage import proteggi_file_riservati
from sync import scheduler
from ytdlp_helpers import ydl_opts_base

# Cartella dei download di una volta: /api/download non scrive più su disco
# (vedi il suo docstring), ma le installazioni già in giro hanno qui dentro
# video interi che nessuno cancellerà mai. Si svuota all'avvio.
VECCHIA_DOWNLOAD_DIR = Path(tempfile.gettempdir()) / "ytproxy_cache"


def _pulisci_cache_download():
    """
    Svuota la cartella dei download di una volta.

    Sono file rigenerabili in qualsiasi momento, quindi buttarli è sicuro; la
    cartella sparisce del tutto, così la pulizia avviene una volta sola.
    """
    if not VECCHIA_DOWNLOAD_DIR.is_dir():
        return
    import shutil
    try:
        liberati = sum(f.stat().st_size for f in VECCHIA_DOWNLOAD_DIR.rglob("*") if f.is_file())
        shutil.rmtree(VECCHIA_DOWNLOAD_DIR)
        if liberati:
            print(f"[main] Vecchia cache dei download rimossa ({liberati // 1048576} MB).")
    except OSError as e:
        print(f"[main] Cache dei download non rimossa: {e}")


async def on_startup():
    _pulisci_cache_download()
    # I file di credenziali creati dalle versioni precedenti sono a 0644: qui
    # vengono riportati a 0600 una volta sola, all'avvio.
    proteggi_file_riservati()
    # Il loop di sync gira subito un ciclo se già autenticato (vedi sync.py),
    # quindi non serve un altro force_sync qui: raddoppierebbe le richieste.
    scheduler.start(state, ydl_opts_base)
