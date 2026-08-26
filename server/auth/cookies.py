"""cookies.py — file cookies.txt caricato manualmente: salvataggio e stato."""
import time

from auth.cookie_session import segnala_logout_youtube, youtube_auth_cookies
from auth.feed_cache import invalidate_feeds
from auth.storage import COOKIE_FILE, scrivi_privato


def _parse_netscape(content: str):
    """(dominio, nome) di ogni cookie in un file in formato Netscape."""
    for line in content.splitlines():
        if not line or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) >= 6:
            yield parts[0], parts[5]


def save_cookies(state, content: str) -> dict:
    """
    Salva il file cookies.txt caricato dall'utente.

    Salva anche quando la sessione non risulta loggata (il file può servire
    lo stesso per aggirare i blocchi anti-bot), ma lo segnala con
    logged_in=False.
    """
    invalidate_feeds(state)  # prima di scrivere: vedi feed_cache.invalidate_feeds
    scrivi_privato(COOKIE_FILE, content)  # è la sessione YouTube dell'utente, vale quanto una password
    segnala_logout_youtube(False)  # sessione nuova: l'avviso può tornare utile
    pairs = list(_parse_netscape(content))
    valid = "# Netscape HTTP Cookie File" in content or any(
        d.endswith("youtube.com") for d, _ in pairs
    )
    return {
        "valid": valid,
        "cookie_count": len(pairs),
        "logged_in": bool(youtube_auth_cookies(pairs)),
    }


def get_cookie_path():
    if COOKIE_FILE.exists() and COOKIE_FILE.stat().st_size > 0:
        return str(COOKIE_FILE)
    return None


def get_cookie_status() -> dict:
    if not COOKIE_FILE.exists():
        return {"present": False, "age_days": None, "warning": False,
                "logged_in": False, "reason": None}
    age = (time.time() - COOKIE_FILE.stat().st_mtime) / 86400
    try:
        pairs = list(_parse_netscape(COOKIE_FILE.read_text()))
    except Exception:
        pairs = []
    logged_in = bool(youtube_auth_cookies(pairs))
    # `reason` distingue due problemi che chiedono rimedi diversi: un file
    # vecchio si risolve riesportandolo, un file senza sessione YouTube no —
    # lì bisogna prima aprire youtube.com nel browser.
    reason = "not-logged-in" if not logged_in else ("stale" if age > 14 else None)
    return {
        "present": True,
        "age_days": round(age, 1),
        "logged_in": logged_in,
        "reason": reason,
        "warning": reason is not None,  # avvisa dopo 2 settimane
    }


def delete_cookies(state):
    if COOKIE_FILE.exists():
        COOKIE_FILE.unlink()
    invalidate_feeds(state)
