"""
La guardia sulle scritture come middleware: prima su un'app minima (tutti i
metodi), poi sull'app vera di main.py — è lì che un cablaggio dimenticato o
nell'ordine sbagliato la renderebbe inutile.
"""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from core.security import blocca_scritture_esterne

OSTILE = {"Origin": "https://evil.example.com"}
LOCALE = {"Origin": "http://localhost:8090"}


def _client_minimo() -> TestClient:
    app = FastAPI()
    app.middleware("http")(blocca_scritture_esterne)

    @app.api_route("/scrivi", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
    def scrivi():
        return {"ok": True}

    return TestClient(app)


@pytest.mark.parametrize("metodo", ["POST", "PUT", "PATCH", "DELETE"])
def test_scritture_filtrate_per_origine(metodo):
    client = _client_minimo()
    assert client.request(metodo, "/scrivi", headers=OSTILE).status_code == 403
    assert client.request(metodo, "/scrivi", headers=LOCALE).status_code == 200
    assert client.request(metodo, "/scrivi").status_code == 200


def test_get_mai_filtrate():
    """Il Chromecast scarica /api/mux da sé: le GET passano anche da un'origine esterna."""
    assert _client_minimo().get("/scrivi", headers=OSTILE).status_code == 200


def test_app_vera_blocca_e_ammette():
    """Endpoint veri: nessun decoratore dedicato, li protegge il middleware da solo."""
    import main
    client = TestClient(main.app)
    risposta = client.delete("/api/history", headers=OSTILE)
    assert risposta.status_code == 403
    assert risposta.json() == {"detail": "Origine non consentita"}
    assert client.patch("/api/prefs", json={"theme": "dark"}, headers=LOCALE).status_code == 200
    assert client.patch("/api/prefs", json={"theme": "dark"}).status_code == 200


def test_app_vera_espone_gli_header_del_mux():
    """
    Senza expose_headers un fetch() cross-origin (l'APK) legge X-Mux-* vuoti e
    il player cade nel ripiego <video src> in silenzio.
    """
    import main
    risposta = TestClient(main.app).get("/api/health", headers={"Origin": "http://192.168.1.5:8090"})
    assert risposta.headers["access-control-allow-origin"] == "http://192.168.1.5:8090"
    esposti = risposta.headers["access-control-expose-headers"]
    for header in ("X-Mux-Codecs", "X-Mux-Start", "X-Mux-Timeline"):
        assert header in esposti
