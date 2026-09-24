"""
crea_ydl (auth/cookie_session.py): la rotazione dei cookie si salva, il
logout deciso da YouTube no. Si usa il vero yt-dlp e il vero cookies.txt —
quello della cartella dati temporanea dei test (conftest.py), mai data/.
"""
import time

import pytest

from auth.cookie_session import AUTH_COOKIE_NAMES, crea_ydl, youtube_auth_cookies
from auth.storage import COOKIE_FILE

_SCADENZA = int(time.time()) + 365 * 86400


@pytest.fixture
def cookie_file():
    righe = [f".youtube.com\tTRUE\t/\tTRUE\t{_SCADENZA}\t{nome}\tvalore-{nome}"
             for nome in sorted(AUTH_COOKIE_NAMES | {"SIDCC"})]
    COOKIE_FILE.write_text("# Netscape HTTP Cookie File\n" + "\n".join(righe) + "\n")
    yield COOKIE_FILE
    COOKIE_FILE.unlink(missing_ok=True)


def test_profilo_solo_google_e_anonimo():
    """Gli stessi nomi su google.com non fanno una sessione YouTube."""
    assert youtube_auth_cookies([(".google.com", "SID"), (".google.com", "SAPISID")]) == set()
    assert youtube_auth_cookies([(".youtube.com", "SID"), (".youtube.com", "PREF")]) == {"SID"}


def test_logout_non_sovrascrive_il_file(cookie_file):
    prima = cookie_file.read_text()
    ydl = crea_ydl({"cookiefile": str(cookie_file), "quiet": True})
    for nome in AUTH_COOKIE_NAMES:                # i Set-Cookie di scadenza di YouTube
        ydl.cookiejar.clear(".youtube.com", "/", nome)
    ydl.close()                                    # YoutubeDL.close() chiama save_cookies()
    assert cookie_file.read_text() == prima


def test_rotazione_salvata_a_0600(cookie_file):
    ydl = crea_ydl({"cookiefile": str(cookie_file), "quiet": True})
    for cookie in ydl.cookiejar:
        if cookie.name == "SIDCC":
            cookie.value = "ruotato"
    ydl.close()
    assert "\tSIDCC\truotato" in cookie_file.read_text()
    assert (cookie_file.stat().st_mode & 0o777) == 0o600
