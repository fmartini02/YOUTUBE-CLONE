"""
subscriptions_state.py — copia locale delle iscrizioni: letture e
aggiornamenti dopo subscribe/unsubscribe (vedi subscriptions_actions.py).

Iscrizione e cancellazione costano 50 unità di quota ciascuna (su
10.000/giorno): sono azioni volute dall'utente, non automatismi, quindi il
costo è accettabile — ma è il motivo per cui lo stato "sono iscritto?" si
legge dalla copia locale e non chiedendolo a YouTube ad ogni pagina canale
aperta.
"""
from auth.storage import SUBS_FEED_CACHE_FILE, SUBS_FILE, _scrivi_json


def is_subscribed(state, channel_id: str) -> bool:
    """Dalla copia locale delle iscrizioni, quella che alimenta tutta la UI."""
    return any(s.get("id") == channel_id for s in state.subs)


def scade_feed_cookie(state):
    """
    Fa scadere la cache in memoria del feed iscrizioni letto dai cookie.

    Quel feed lo calcola YouTube, quindi la copia locale non lo tocca: senza
    scaderla, per qualche minuto le Iscrizioni continuerebbero a mostrare i
    video di un canale appena lasciato — o a non mostrare quelli di uno
    appena aggiunto.
    """
    state.cookie_feed_cache = []
    state.cookie_feed_cache_at = 0


def remember_sub(state, entry: dict):
    """Aggiunge (o aggiorna) un canale nella copia locale, in ordine alfabetico come la sync."""
    state.subs = [s for s in state.subs if s.get("id") != entry["id"]]
    state.subs.append(entry)
    state.subs.sort(key=lambda s: (s.get("name") or "").casefold())
    _scrivi_json(SUBS_FILE, state.subs)
    scade_feed_cookie(state)


def forget_sub(state, channel_id: str) -> bool:
    """Toglie il canale dalla copia locale e dalla cache del feed iscrizioni."""
    before = len(state.subs)
    state.subs = [s for s in state.subs if s.get("id") != channel_id]
    removed = len(state.subs) != before
    if removed:
        _scrivi_json(SUBS_FILE, state.subs)
    # Senza questo il feed continuerebbe a mostrare i video del canale appena
    # abbandonato fino alla ricostruzione oraria della cache.
    feed = [v for v in state.subs_feed_cache if v.get("channel_id") != channel_id]
    if len(feed) != len(state.subs_feed_cache):
        state.subs_feed_cache = feed
        _scrivi_json(SUBS_FEED_CACHE_FILE, state.subs_feed_cache)
    scade_feed_cookie(state)
    return removed
