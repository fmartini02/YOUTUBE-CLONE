"""
/api/mux con `codec=` (la scelta del dispositivo, `api/codecDevice.js`): il
parametro deve arrivare a `_mux_formats`, cioè al selettore e alla chiave della
cache — un flusso VP9 e uno AV1 dello stesso video non devono condividerla.
Separato da test_mux_stream.py per la regola dei 5 per file.
"""
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from routers import streaming

FORMATI = ("https://v", "https://a", "mp4", "vp09.00.41.08", "opus")


def test_codec_arriva_a_mux_formats(monkeypatch):
    chiamate = []

    async def pipe_finta(cmd, tag, headers=None, media_type="video/mp4"):
        return JSONResponse({}, headers=headers)

    monkeypatch.setattr(streaming, "_mux_formats", lambda *argomenti: chiamate.append(argomenti) or FORMATI)
    monkeypatch.setattr(streaming, "ffmpeg_pipe_response", pipe_finta)
    app = FastAPI()
    app.include_router(streaming.router)
    client = TestClient(app)
    r = client.get("/api/mux/abcdefghijk?quality=1080&codec=vp9&tempi=sorgente")
    client.get("/api/mux/abcdefghijk")
    assert r.headers["X-Mux-Codecs"] == "vp09.00.41.08,opus"
    assert chiamate == [("abcdefghijk", "1080", False, False, "vp9"), ("abcdefghijk", "best", False, False, "")]
