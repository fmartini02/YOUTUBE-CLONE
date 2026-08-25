"""oauth_status.py — stato dell'autenticazione: collegato? può scrivere?"""
from auth.config import WRITE_SCOPE
from auth.storage import TOKEN_FILE


def is_authenticated(state) -> bool:
    return bool(state.token.get("refresh_token"))


def logout(state):
    state.token = {}
    state.me = None
    if TOKEN_FILE.exists():
        TOKEN_FILE.unlink()


def can_write(state) -> bool:
    """
    True solo se il token collegato comprende lo scope di scrittura, che
    serve sia per pubblicare commenti sia per iscriversi a un canale.
    Un account collegato prima che esistessero queste funzioni è
    autenticato ma può solo leggere: serve rifare il login.

    Un solo controllo per entrambe le azioni perché lo scope è lo stesso
    (`youtube`, non `youtube.force-ssl` — il device flow non accetta
    quest'ultimo, vedi il commento su WRITE_SCOPE in config.py).
    """
    return is_authenticated(state) and WRITE_SCOPE in (state.token.get("scope") or "")
