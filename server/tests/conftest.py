"""
conftest.py — ambiente comune ai test del server.

La prima cosa, prima di qualunque import del server: `YTPROXY_DATA` su una
cartella temporanea. `auth/storage.py` legge DATA_DIR all'import e
`auth/state.py` carica lo stato all'import, quindi senza questo i test
leggerebbero (e le prove che scrivono riscriverebbero) i cookie, il token
OAuth e le preferenze veri in `data/`. Vale anche per le prove `rete`.
"""
import os
import shutil
import tempfile
from pathlib import Path

import pytest

DATI_DI_PROVA = Path(tempfile.mkdtemp(prefix="ytproxy-test-"))
os.environ["YTPROXY_DATA"] = str(DATI_DI_PROVA)

from media_finti import ffmpeg_disponibile, genera_media  # noqa: E402
from ydl_finto import YdlFinto  # noqa: E402


def pytest_sessionfinish(session, exitstatus):
    shutil.rmtree(DATI_DI_PROVA, ignore_errors=True)


@pytest.fixture(scope="session")
def media_finti():
    """(video, audio) sintetici — vedi media_finti.py. Salta se manca ffmpeg.

    Tenuti nella cartella temporanea di sistema, non in DATI_DI_PROVA: così
    si generano una volta e le esecuzioni successive li riusano.
    """
    if not ffmpeg_disponibile():
        pytest.skip("ffmpeg/ffprobe non installati")
    return genera_media(Path(tempfile.gettempdir()) / "ytproxy-media-finti")


@pytest.fixture
def ydl_finto(monkeypatch):
    """
    Sostituisce `crea_ydl` in lazy_feed con un yt-dlp finto.

    Si chiama con l'elenco delle estrazioni, una lista di id per ognuna: ogni
    apertura del feed consuma la successiva (l'ultima si ripete). Restituisce
    le istanze create, per controllare quante riaperture ci sono state e cosa
    è stato letto da ognuna.
    """
    import auth.lazy_feed as lazy_feed

    def prepara(estrazioni: list) -> list:
        create = []

        def crea(opts):
            create.append(YdlFinto(estrazioni[min(len(create), len(estrazioni) - 1)]))
            return create[-1]

        monkeypatch.setattr(lazy_feed, "crea_ydl", crea)
        return create

    return prepara
