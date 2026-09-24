"""
auth/storage.py: un salvataggio interrotto non lascia mai un JSON a metà, un
file rotto non impedisce l'avvio, le credenziali restano a 0600.
"""
import json
import os

from auth import storage


def test_scrittura_atomica_senza_residui(tmp_path):
    p = tmp_path / "prefs.json"
    storage._scrivi_json(p, {"theme": "dark"})
    assert json.loads(p.read_text()) == {"theme": "dark"}
    assert [f.name for f in tmp_path.iterdir()] == ["prefs.json"]


def test_scrittura_fallita_lascia_il_file_vecchio(tmp_path):
    """json.dump si rompe a metà (valore non serializzabile): il file finale resta quello di prima."""
    p = tmp_path / "history.json"
    storage._scrivi_json(p, [{"id": "vecchio"}])
    storage._scrivi_json(p, [{"id": "nuovo", "rotto": object()}])
    assert json.loads(p.read_text()) == [{"id": "vecchio"}]
    assert not (tmp_path / "history.json.tmp").exists()


def test_file_corrotto_messo_da_parte(tmp_path):
    p = tmp_path / "subscriptions.json"
    p.write_text('[{"id": "UC')                       # troncato da un kill
    assert storage._leggi_json(p, []) == []
    assert not p.exists()
    assert (tmp_path / "subscriptions.json.corrotto").read_text() == '[{"id": "UC'
    assert storage._leggi_json(p, {"vuoto": True}) == {"vuoto": True}   # mancante


def test_credenziali_a_0600(tmp_path):
    """Anche un file che esisteva già a 0644: write_text() da solo non ne cambia i permessi."""
    p = tmp_path / "cookies.txt"
    p.write_text("vecchio")
    os.chmod(p, 0o644)
    storage.scrivi_privato(p, "segreto")
    assert p.read_text() == "segreto" and (p.stat().st_mode & 0o777) == 0o600
    token = tmp_path / "oauth_token.json"
    storage._scrivi_json(token, {"refresh_token": "x"}, privato=True)
    assert (token.stat().st_mode & 0o777) == 0o600
    os.chmod(token, 0o644)
    storage._scrivi_json(token, {"refresh_token": "y"}, privato=True)
    assert (token.stat().st_mode & 0o777) == 0o600


def test_proteggi_file_riservati_all_avvio():
    """I file lasciati a 0644 da una versione precedente tornano a 0600 all'avvio."""
    storage.TOKEN_FILE.write_text("{}")
    os.chmod(storage.TOKEN_FILE, 0o644)
    try:
        storage.proteggi_file_riservati()
        assert (storage.TOKEN_FILE.stat().st_mode & 0o777) == 0o600
    finally:
        storage.TOKEN_FILE.unlink()
