"""
cookies_import.py — import automatico dei cookie dal database del browser
(niente estensioni/export manuale).

yt-dlp sa leggere i cookie direttamente dal database del browser, ma su Linux
cerca solo il percorso standard (~/.config/...). Se il browser è installato
via snap (comune su Ubuntu: Brave, Chromium, Firefox), snap confina i suoi
dati reali in ~/snap/<pkg>/... e quel percorso standard è vuoto o non
aggiornato — va indicato esplicitamente.
"""
import os

from auth.cookie_session import segnala_logout_youtube, youtube_auth_cookies
from auth.feed_cache import invalidate_feeds
from auth.storage import COOKIE_FILE, proteggi_file

_SNAP_PROFILE_HINTS = {
    "brave": "~/snap/brave/current/.config/BraveSoftware/Brave-Browser",
    "chromium": "~/snap/chromium/current/.config/chromium",
    "firefox": "~/snap/firefox/common/.mozilla/firefox",
}
_CANDIDATE_BROWSERS = ("brave", "chrome", "chromium", "edge", "firefox", "vivaldi", "opera")


def _browser_profile_path(browser: str):
    hint = _SNAP_PROFILE_HINTS.get(browser)
    if not hint:
        return None
    path = os.path.expanduser(hint)
    return path if os.path.isdir(path) else None


def _extract_browser_jar(browser: str):
    import yt_dlp.cookies as ytc
    return ytc.extract_cookies_from_browser(browser, _browser_profile_path(browser))


def detect_browsers_with_youtube_login() -> list:
    """
    Browser con una sessione YouTube vera e propria.

    Il controllo è sui cookie del dominio youtube.com: bastava trovarli su
    google.com per proporre un browser che poi importava una sessione
    anonima, e la home ricadeva silenziosamente sui trending.
    """
    found = []
    for browser in _CANDIDATE_BROWSERS:
        try:
            jar = _extract_browser_jar(browser)
        except Exception:
            continue
        if youtube_auth_cookies((ck.domain, ck.name) for ck in jar):
            found.append(browser)
    return found


def import_cookies_from_browser(state, browser: str) -> dict:
    """
    Estrae i cookie YouTube/Google dal browser indicato e li salva come
    cookies.txt — nessun passaggio manuale.

    Rifiuta l'import se nel profilo non c'è una sessione YouTube di prima
    parte: salvare comunque il file produrrebbe un cookies.txt di aspetto
    normale (decine di cookie google.com) che però lascia yt-dlp anonimo.
    """
    import yt_dlp.cookies as ytc
    jar = _extract_browser_jar(browser)
    out_jar = ytc.YoutubeDLCookieJar()
    count = 0
    for ck in jar:
        if ck.domain.endswith(("youtube.com", "google.com")):
            out_jar.set_cookie(ck)
            count += 1
    auth = youtube_auth_cookies((ck.domain, ck.name) for ck in jar)
    if not auth:
        return {"valid": False, "cookie_count": count, "logged_in": False}
    invalidate_feeds(state)  # prima di scrivere: vedi feed_cache.invalidate_feeds
    out_jar.save(str(COOKIE_FILE), ignore_discard=True, ignore_expires=True)
    proteggi_file(COOKIE_FILE)
    segnala_logout_youtube(False)  # sessione nuova: l'avviso può tornare utile
    return {"valid": True, "cookie_count": count, "logged_in": True}
