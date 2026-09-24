"""
Chi può far scrivere il server: `origine_ammessa` di core/security.py.

La matrice copre i casi di CLAUDE.md ("Chi può scrivere"): origine assente,
reti private, same-origin rispetto a Host, `YTPROXY_ALLOWED_ORIGINS`, e i
travestimenti che una regex scritta male lascerebbe passare.
"""
import importlib

import pytest

from core import security

CASI = [
    # (Origin, Host, ammessa)
    ("", "192.168.1.11:8090", True),                        # curl, app nativa, Chromecast
    ("http://localhost:8090", "", True),
    ("http://127.0.0.1:3000", "", True),                    # vite dev
    ("http://[::1]:8090", "", True),
    ("http://192.168.1.11:8090", "", True),
    ("http://10.0.0.5", "", True),
    ("http://172.16.0.2:8090", "", True),
    ("http://172.31.255.1", "", True),
    ("http://raspberrypi.local:8090", "", True),
    ("capacitor://localhost", "", True),
    ("http://100.64.0.7:8090", "100.64.0.7:8090", True),    # Tailscale, same-origin
    ("https://ytproxy.example.com", "ytproxy.example.com", True),  # reverse proxy, same-origin
    ("https://evil.example.com", "192.168.1.11:8090", False),
    ("http://100.64.0.7:8090", "192.168.1.11:8090", False),  # Tailscale ma non same-origin
    ("http://172.32.0.1", "", False),                       # fuori da 172.16-31
    ("http://192.168.1.11.evil.com", "", False),
    ("http://localhost.evil.com", "", False),
    ("https://evil.local.example.com", "", False),
    ("null", "", False),                                    # iframe sandbox, file://
]


@pytest.mark.parametrize("origin,host,ammessa", CASI)
def test_matrice_origini(origin, host, ammessa):
    assert security.origine_ammessa(origin, host) is ammessa


def test_origini_extra(monkeypatch):
    monkeypatch.setattr(security, "ORIGINI_EXTRA", ["https://casa.tail1234.ts.net"])
    assert security.origine_ammessa("https://casa.tail1234.ts.net", "")
    assert not security.origine_ammessa("https://altra.tail1234.ts.net", "")


def test_variabile_d_ambiente(monkeypatch):
    """YTPROXY_ALLOWED_ORIGINS è letta all'import: separata da virgole, spazi e voci vuote ignorati."""
    monkeypatch.setenv("YTPROXY_ALLOWED_ORIGINS", " https://a.ts.net , ,https://b.example.com")
    try:
        ricaricato = importlib.reload(security)
        assert ricaricato.ORIGINI_EXTRA == ["https://a.ts.net", "https://b.example.com"]
    finally:
        monkeypatch.delenv("YTPROXY_ALLOWED_ORIGINS")
        importlib.reload(security)
    assert security.ORIGINI_EXTRA == []
