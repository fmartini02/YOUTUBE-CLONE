"""
Prove contro YouTube vero: escluse di default (vedi pytest.ini), si lanciano
con `python3 -m pytest -m rete`. Lente e dipendenti da YouTube: un fallimento
qui può essere YouTube che cambia, non una regressione — rileggere il log.
"""
import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.rete

VIDEO = "jNQXAC9IVRw"   # "Me at the zoo": corto, pubblico da sempre


@pytest.fixture(scope="module")
def client():
    import main
    return TestClient(main.app)


def test_watch_reale(client):
    r = client.get(f"/api/watch/{VIDEO}")
    assert r.status_code == 200
    dati = r.json()
    assert dati["title"] and dati["duration"] > 0 and isinstance(dati["chapters"], list)
    assert "googlevideo" not in r.text               # gli URL di stream li risolve /api/mux


def test_mux_reale_timeline_sorgente(client):
    with client.stream("GET", f"/api/mux/{VIDEO}?quality=360&start=5&tempi=sorgente") as r:
        assert r.status_code == 200
        assert r.headers["X-Mux-Timeline"] == "sorgente"
        assert "," in r.headers["X-Mux-Codecs"]
        primo = next(r.iter_bytes())
    assert primo[4:8] == b"ftyp"                       # un MP4 vero, non un errore


def test_video_inesistente_404(client):
    assert client.get("/api/watch/WRVsOCh907o").status_code == 404
