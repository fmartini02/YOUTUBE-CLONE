"""
_keyframe_before (timeline relativa): arrotondamento per eccesso, ripiego sul
valore grezzo, cache. ffprobe è finto: si controlla come ne legge l'uscita.
"""
import subprocess
from types import SimpleNamespace

import pytest

from routers import streaming


@pytest.fixture(autouse=True)
def cache_vuota(monkeypatch):
    monkeypatch.setattr(streaming, "_keyframe_cache", {})


def test_arrotonda_per_eccesso(monkeypatch):
    """
    Un keyframe a 60.958333 scritto "60.958" cade prima di sé stesso e ffmpeg
    torna indietro di un segmento intero: il valore va arrotondato per eccesso.
    Conta solo il primo pacchetto col flag K.
    """
    uscita = "60.500000,__\n60.958333,K__\n62.958333,K__\n"
    monkeypatch.setattr(streaming.subprocess, "run",
                        lambda *a, **k: SimpleNamespace(stdout=uscita))
    assert streaming._keyframe_before("https://v", 61.2) == 60.959


def test_timeout_ripiega_sul_valore_grezzo(monkeypatch):
    def lento(cmd, **kwargs):
        raise subprocess.TimeoutExpired(cmd, kwargs.get("timeout"))

    monkeypatch.setattr(streaming.subprocess, "run", lento)
    assert streaming._keyframe_before("https://v", 42.5) == 42.5


def test_zero_non_lancia_ffprobe(monkeypatch):
    monkeypatch.setattr(streaming.subprocess, "run", lambda *a, **k: pytest.fail("ffprobe lanciato"))
    assert streaming._keyframe_before("https://v", 0) == 0


def test_salto_ripetuto_usa_la_cache(monkeypatch):
    """Tasti freccia premuti in fila sullo stesso punto: un solo ffprobe."""
    chiamate = []

    def conta(*a, **k):
        chiamate.append(a)
        return SimpleNamespace(stdout="30.000000,K__\n")

    monkeypatch.setattr(streaming.subprocess, "run", conta)
    assert streaming._keyframe_before("https://v", 31.0) == 30.0
    assert streaming._keyframe_before("https://v", 31.0) == 30.0
    assert len(chiamate) == 1
