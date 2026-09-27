"""
Feed 'Iscrizioni' dei cookie (auth/cookie_feed.py): la copia scaduta si serve
subito e si aggiorna in background, un'estrazione alla volta, e una scadenza
forzata (iscrizione, cookie cambiati) non viene annullata da un aggiornamento
partito prima. L'estrazione è finta: niente yt-dlp, niente rete.
"""
import asyncio
import time

from auth import cookie_feed
from auth.config import COOKIE_FEED_CACHE_TTL, COOKIE_FEED_RIPROVA_S
from auth.state import AuthState
from auth.subscriptions_state import scade_feed_cookie
from sync import feed_cookie as ciclo


def _finto(monkeypatch, risposta):
    """Sostituisce l'estrazione: dopo un attimo restituisce `risposta`. Ritorna la lista delle chiamate."""
    chiamate = []

    async def _fetch(_opts_fn, cookie_path):
        chiamate.append(cookie_path)
        await asyncio.sleep(0.05)
        return risposta

    monkeypatch.setattr(cookie_feed, "_fetch_cookie_feed", _fetch)
    monkeypatch.setattr(cookie_feed, "get_cookie_path", lambda: "/finto/cookies.txt")
    return chiamate


def test_scaduta_servita_subito_e_aggiornata_in_background(monkeypatch):
    chiamate = _finto(monkeypatch, [{"id": "nuovo"}])
    s = AuthState(cookie_feed_cache=[{"id": "vecchio"}], cookie_feed_cache_at=time.time() - COOKIE_FEED_CACHE_TTL - 1)

    async def prova():
        t0 = time.monotonic()
        servito = await cookie_feed.feed_cookie(s, dict)
        assert time.monotonic() - t0 < 0.02  # non ha aspettato l'estrazione
        assert servito == [{"id": "vecchio"}]
        await s.cookie_feed_task
    asyncio.run(prova())
    assert chiamate and s.cookie_feed_cache == [{"id": "nuovo"}]
    assert not cookie_feed.scaduta(s)


def test_cache_vuota_una_sola_estrazione_condivisa(monkeypatch):
    chiamate = _finto(monkeypatch, [{"id": "a"}])
    s = AuthState()

    async def prova():
        return await asyncio.gather(*[cookie_feed.feed_cookie(s, dict) for _ in range(3)])
    risultati = asyncio.run(prova())
    assert risultati == [[{"id": "a"}]] * 3
    assert len(chiamate) == 1


def test_scadenza_forzata_durante_aggiornamento_non_riscritta(monkeypatch):
    """Disiscrizione mentre un aggiornamento è in volo: il feed di prima non deve tornare in cache."""
    _finto(monkeypatch, [{"id": "canale-lasciato"}])
    s = AuthState(cookie_feed_cache=[{"id": "x"}], cookie_feed_cache_at=0)

    async def prova():
        task = cookie_feed.aggiorna_in_background(s, dict)
        scade_feed_cookie(s)
        await task
    asyncio.run(prova())
    assert s.cookie_feed_cache == [] and s.cookie_feed_cache_at == 0


def test_aggiornamento_fallito_tiene_la_copia_e_rimanda(monkeypatch):
    chiamate = _finto(monkeypatch, None)
    s = AuthState(cookie_feed_cache=[{"id": "vecchio"}], cookie_feed_cache_at=0)

    async def prova():
        await cookie_feed.feed_cookie(s, dict)
        await s.cookie_feed_task
        await cookie_feed.feed_cookie(s, dict)  # non deve ripartire subito
    asyncio.run(prova())
    assert len(chiamate) == 1 and s.cookie_feed_cache == [{"id": "vecchio"}]
    assert not cookie_feed.scaduta(s)
    assert abs(ciclo._attesa(s) - COOKIE_FEED_RIPROVA_S) < 2  # il ciclo riprova fra RIPROVA, non fra un minuto
