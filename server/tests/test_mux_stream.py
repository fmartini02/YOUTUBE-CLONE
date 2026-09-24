"""
/api/mux: le decisioni prese PRIMA di lanciare ffmpeg — probe sì/no, audio
ricodificato sì/no, header per il player MSE. ffmpeg e yt-dlp sono finti:
qui interessa che il comando e gli header scelti siano quelli giusti.
"""
import pytest
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from routers import streaming

KEYFRAME = 58.959


@pytest.fixture
def mux(monkeypatch):
    """(client, stato): stato["probe"] elenca i salti passati a _keyframe_before."""
    stato = {"probe": [], "formati": ("https://v", "https://a", "mp4", "av01.0.05M.08", "opus")}
    monkeypatch.setattr(streaming, "_mux_formats", lambda *argomenti: stato["formati"])

    def keyframe_finto(url, target):
        stato["probe"].append(target)
        return KEYFRAME

    async def pipe_finta(cmd, tag, headers=None, media_type="video/mp4"):
        return JSONResponse({"cmd": " ".join(cmd), "media_type": media_type}, headers=headers)

    monkeypatch.setattr(streaming, "_keyframe_before", keyframe_finto)
    monkeypatch.setattr(streaming, "ffmpeg_pipe_response", pipe_finta)
    app = FastAPI()
    app.include_router(streaming.router)
    return TestClient(app), stato


def test_sorgente_senza_probe(mux):
    client, stato = mux
    r = client.get("/api/mux/abcdefghijk?start=60.3&tempi=sorgente")
    assert r.headers["X-Mux-Timeline"] == "sorgente" and "X-Mux-Start" not in r.headers
    assert r.headers["X-Mux-Codecs"] == "av01.0.05M.08,opus"   # audio in copia anche sui salti
    assert stato["probe"] == []
    assert "-copyts" in r.json()["cmd"] and "-ss 60.300" in r.json()["cmd"]


def test_relativo_con_probe(mux):
    """Ripiego <video src> e Cast: il keyframe del probe va a entrambi gli input, audio in AAC."""
    client, stato = mux
    r = client.get("/api/mux/abcdefghijk?start=60.3")
    assert stato["probe"] == [60.3]
    assert r.headers["X-Mux-Start"] == f"{KEYFRAME:.3f}" and "X-Mux-Timeline" not in r.headers
    assert r.headers["X-Mux-Codecs"] == "av01.0.05M.08,mp4a.40.2"
    assert f"-ss {KEYFRAME:.3f} -i https://a" in r.json()["cmd"]


def test_partenza_da_zero(mux):
    client, stato = mux
    r = client.get("/api/mux/abcdefghijk")
    assert stato["probe"] == [] and r.headers["X-Mux-Start"] == "0.000"
    assert r.headers["X-Mux-Codecs"] == "av01.0.05M.08,opus"
    assert "-ss" not in r.json()["cmd"]
    assert r.headers["Accept-Ranges"] == "none"


def test_webm_del_cast_senza_header_mse(mux):
    """Cast 4K (VP9 in WebM): niente probe, niente header per MSE, che assume video/mp4."""
    client, stato = mux
    stato["formati"] = ("https://v", "https://a", "webm", "vp9", "opus")
    r = client.get("/api/mux/abcdefghijk?quality=2160&compat=1&start=30&tempi=sorgente")
    assert stato["probe"] == [] and r.json()["media_type"] == "video/webm"
    assert not any(h.lower().startswith("x-mux") for h in r.headers)
