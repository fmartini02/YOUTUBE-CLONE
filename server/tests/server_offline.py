"""
server_offline.py — il server vero, senza YouTube, per i test Playwright
(`frontend/e2e/`). Lo avvia da sé `frontend/playwright.config.js`.

Tutto il percorso della riproduzione resta quello vero: routing SPA, guardia
sulle scritture, `/api/mux` con ffmpeg, header `X-Mux-*`, timeline sorgente.
L'unica cosa sostituita è `_mux_formats`, cioè l'estrazione yt-dlp degli URL
googlevideo: per l'id `ID_FINTO` restituisce i due file sintetici di
media_finti.py (VP9 + Opus separati, come i flussi adattivi veri). Ogni altro
id passa all'originale, così le prove `@rete` usano lo stesso server.

I metadati di `/api/watch/ID_FINTO` e le chiamate che andrebbero comunque su
YouTube (correlati, commenti, miniature...) li finge il test con
`page.route` (vedi `frontend/e2e/aiuti.js`), non questo file.

`data/` è una cartella temporanea: le prove che scrivono (tema, cronologia)
non toccano preferenze e cookie veri, e ogni avvio parte pulito.
"""
import os
import shutil
import sys
import tempfile
from pathlib import Path

DATI = Path(tempfile.mkdtemp(prefix="ytproxy-e2e-"))
PORTA = os.environ.setdefault("YTPROXY_PORT", os.environ.get("YTPROXY_E2E_PORT", "8098"))
os.environ["YTPROXY_DATA"] = str(DATI)
sys.path[:0] = [str(Path(__file__).resolve().parent.parent), str(Path(__file__).resolve().parent)]

import uvicorn  # noqa: E402

import main  # noqa: E402
from media_finti import ACODEC, ID_FINTO, VCODEC, genera_media  # noqa: E402
from routers import streaming  # noqa: E402


def _mux_formats_offline(originale, video: Path, audio: Path):
    """`_mux_formats` che per ID_FINTO risponde con i file locali, per il resto chiama l'originale."""
    def mux_formats(video_id, *resto):
        if video_id == ID_FINTO:
            return (str(video), str(audio), "mp4", VCODEC, ACODEC)
        return originale(video_id, *resto)
    return mux_formats


def avvia():
    video, audio = genera_media(Path(tempfile.gettempdir()) / "ytproxy-media-finti")
    streaming._mux_formats = _mux_formats_offline(streaming._mux_formats, video, audio)
    print(f"[e2e] server offline su 127.0.0.1:{PORTA}, dati in {DATI}")
    try:
        uvicorn.run(main.app, host="127.0.0.1", port=int(PORTA), log_level="warning")
    finally:
        shutil.rmtree(DATI, ignore_errors=True)


if __name__ == "__main__":
    avvia()
