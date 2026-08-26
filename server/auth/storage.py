"""
storage.py — percorsi dei file dati e scrittura/lettura JSON che non lascia
mai un file a metà.
"""
import json
import os
from pathlib import Path

DATA_DIR = Path(os.environ.get("YTPROXY_DATA", Path(__file__).parent.parent.parent / "data"))
DATA_DIR.mkdir(exist_ok=True)

TOKEN_FILE = DATA_DIR / "oauth_token.json"
SUBS_FILE = DATA_DIR / "subscriptions.json"
COOKIE_FILE = DATA_DIR / "cookies.txt"
PREFS_FILE = DATA_DIR / "prefs.json"
HISTORY_FILE = DATA_DIR / "history.json"
AVATAR_CACHE_FILE = DATA_DIR / "channel_avatars.json"
SUBS_FEED_CACHE_FILE = DATA_DIR / "subscriptions_feed_cache.json"
OAUTH_SETUP_FILE = DATA_DIR / "oauth_setup.json"

# File che contengono credenziali: refresh token Google, client secret e la
# sessione YouTube. Vanno scritti a 0600 — con i permessi di default (0644)
# qualsiasi altro utente della macchina se li legge, e su un server sempre
# acceso (Raspberry, NAS) di utenti ce n'è più di uno.
FILE_RISERVATI = (TOKEN_FILE, OAUTH_SETUP_FILE, COOKIE_FILE)


def proteggi_file(path: Path):
    """Porta il file a 0600 se esiste. Silenzioso su filesystem senza permessi POSIX."""
    try:
        if path.exists():
            os.chmod(path, 0o600)
    except OSError:
        # FAT32/exFAT (chiavetta, share di rete) non hanno i permessi Unix: non
        # è un errore che debba impedire l'avvio del server.
        pass


def scrivi_privato(path: Path, content: str):
    """Come path.write_text(), ma il file resta leggibile solo dal proprietario.

    Il chmod va rifatto ad ogni scrittura e non solo alla creazione: write_text()
    su un file che esiste già non ne tocca i permessi, quindi un data/ creato da
    una versione precedente resterebbe a 0644 per sempre.
    """
    path.write_text(content)
    proteggi_file(path)


def proteggi_file_riservati():
    """Rimette a 0600 i file di credenziali già presenti su disco (chiamata all'avvio)."""
    for path in FILE_RISERVATI:
        proteggi_file(path)


def _scrivi_json(path: Path, data, privato: bool = False):
    """
    Salva un JSON senza poter lasciare il file a metà.

    Tutto lo stato del server sta in questi file e vengono riscritti interi ad
    ogni modifica: con una `write_text` diretta basta un kill (o un riavvio del
    Raspberry) durante la scrittura per lasciare un JSON troncato, che al
    riavvio successivo faceva esplodere il caricamento — e siccome lo stato è
    caricato all'import (vedi state.py), il server non partiva più.

    Si scrive quindi su un temporaneo nella stessa cartella e lo si sposta con
    os.replace, che è atomico: il file finale o è quello vecchio o è quello
    nuovo, mai una via di mezzo.

    Con `privato` il file resta leggibile solo dal proprietario (0600): serve a
    quelli che contengono credenziali, come il refresh token. I permessi si
    mettono sul TEMPORANEO, prima dello spostamento: farlo dopo lascerebbe una
    finestra, per quanto breve, in cui il file definitivo è leggibile da tutti.
    """
    tmp = path.with_name(path.name + ".tmp")
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        if privato:
            proteggi_file(tmp)
        os.replace(tmp, path)
    except Exception as e:
        print(f"[auth] Impossibile salvare {path.name}: {e}")
        try:
            tmp.unlink()
        except OSError:
            pass


def _leggi_json(path: Path, default):
    """
    Carica un JSON, tornando al valore predefinito se manca o è illeggibile.

    Un file corrotto (vedi _scrivi_json) non deve impedire l'avvio: perdere la
    cronologia o la cache dei loghi è molto meno grave di un server che non
    parte. Il file rotto viene messo da parte con estensione .corrotto, così
    resta recuperabile a mano e non viene riletto ad ogni riavvio.
    """
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text())
    except Exception as e:
        print(f"[auth] {path.name} illeggibile ({e}): lo metto da parte come "
              f"{path.name}.corrotto e riparto da zero.")
        try:
            os.replace(path, path.with_name(path.name + ".corrotto"))
        except OSError:
            pass
        return default
