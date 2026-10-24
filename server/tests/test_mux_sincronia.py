"""
/api/mux dall'inizio alla fine, con ffmpeg vero: la sincronia dei salti si
controlla sui byte che arrivano al client, non sul solo comando. Passano
quindi anche la scelta del ramo (timeline sorgente o relativa, probe sì/no),
gli header per il player MSE e `ffmpeg_pipe_response` (compresa la chiusura
a metà flusso, come il player che riapre a ogni salto).

L'unica cosa finta è `_mux_formats`, che al posto degli URL googlevideo
restituisce i file sintetici: i file locali non passano dal proxy a blocchi
(`via_proxy` tocca solo `*.googlevideo.com`), che ha i suoi test in
test_proxy_blocchi.py — compresa l'uscita di ffmpeg identica byte per byte.
"""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from media_finti import CODEC_MSE, ID_FINTO
from routers import streaming
from sincronia import scarto


@pytest.fixture
def client_mux(monkeypatch, coppia_finta):
    codec, video, audio = coppia_finta
    formati = (str(video), str(audio), "mp4", *CODEC_MSE[codec])
    monkeypatch.setattr(streaming, "_mux_formats", lambda *argomenti: formati)
    app = FastAPI()
    app.include_router(streaming.router)
    return TestClient(app)


def _scarica(client, url: str, uscita, byte: int = 300_000) -> dict:
    """I primi `byte` della risposta, poi chiude la connessione; restituisce gli header."""
    dati = bytearray()
    with client.stream("GET", url) as risposta:
        assert risposta.status_code == 200
        for blocco in risposta.iter_bytes():
            dati += blocco
            if len(dati) >= byte:
                break
        uscita.write_bytes(bytes(dati))
        return dict(risposta.headers)


@pytest.mark.parametrize("salti", [[13.7], [450.3, 13.7, 597.0]])
def test_salti_sulla_timeline_sorgente(client_mux, coppia_finta, salti, tmp_path):
    """Uno o più salti di fila: ognuno arriva al client coi tempi veri, video e audio allineati."""
    codec, video, audio = coppia_finta
    for salto in salti:
        uscita = tmp_path / f"mux-{salto}.mp4"
        headers = _scarica(client_mux, f"/api/mux/{ID_FINTO}?start={salto}&tempi=sorgente", uscita)
        assert headers["x-mux-timeline"] == "sorgente"
        assert headers["x-mux-codecs"] == ",".join(CODEC_MSE[codec])
        assert scarto(uscita, video, "v:0") == 0, f"video spostato dopo il salto a {salto}"
        assert scarto(uscita, audio, "a:0") == 0, f"audio spostato dopo il salto a {salto}"


def test_partenza_da_zero_allineata(client_mux, coppia_finta, tmp_path):
    """`start=0` del player passa anch'esso dalla timeline sorgente: stesso scarto per le due tracce."""
    _, video, audio = coppia_finta
    uscita = tmp_path / "mux-0.mp4"
    _scarica(client_mux, f"/api/mux/{ID_FINTO}?tempi=sorgente", uscita)
    assert abs(scarto(uscita, video, "v:0") - scarto(uscita, audio, "a:0")) <= 0.001
