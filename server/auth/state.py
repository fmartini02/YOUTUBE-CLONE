"""
state.py — Stato in memoria di YTProxy: token OAuth, iscrizioni, preferenze,
cronologia, cache dei loghi canale e feed pigri aperti.

Prima era tenuto sui campi `self._x` del singleton AuthManager; qui è un
oggetto dati passato esplicitamente come primo argomento alle funzioni degli
altri moduli, così ogni dominio (cookie, OAuth, feed...) può stare nel proprio
file senza bisogno di un metodo per operazione sulla stessa classe.

Caricato una volta all'avvio (load_state) e tenuto vivo per tutta la vita del
processo — vedi il singleton `state` in fondo al file.
"""
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Optional

from auth.storage import (
    TOKEN_FILE, SUBS_FILE, PREFS_FILE, HISTORY_FILE,
    AVATAR_CACHE_FILE, SUBS_FEED_CACHE_FILE, _leggi_json,
)


@dataclass
class AuthState:
    token: dict = field(default_factory=dict)
    subs: list = field(default_factory=list)
    prefs: dict = field(default_factory=dict)
    history: list = field(default_factory=list)
    avatar_cache: dict = field(default_factory=dict)
    # Canale YouTube dell'account collegato (nome/avatar per la casella
    # "commenta come"): None = mai letto, {} = account senza canale.
    me: Optional[dict] = None
    subs_feed_cache: list = field(default_factory=list)
    cookie_feed_cache: list = field(default_factory=list)
    cookie_feed_cache_at: float = 0
    # Estrattori pigri tenuti vivi fra una richiesta e l'altra per poter
    # continuare ogni feed da dove era arrivato (vedi lazy_feed.LazyFeed): la
    # home e il mix dei video aperti di recente. Dict ordinato = cache LRU.
    feeds: "OrderedDict" = field(default_factory=OrderedDict)
    # Un lock per feed: il generatore di yt-dlp non è thread-safe e due
    # scroll paralleli (due schede, o un refresh) lo corromperebbero.
    feed_locks: dict = field(default_factory=dict)


def load_state() -> AuthState:
    """Carica tutto lo stato persistito su disco (vedi storage._leggi_json)."""
    return AuthState(
        token=_leggi_json(TOKEN_FILE, {}),
        subs=_leggi_json(SUBS_FILE, []),
        prefs=_leggi_json(PREFS_FILE, {}),
        history=_leggi_json(HISTORY_FILE, []),
        avatar_cache=_leggi_json(AVATAR_CACHE_FILE, {}),
        subs_feed_cache=_leggi_json(SUBS_FEED_CACHE_FILE, []),
    )


# Singleton: caricato all'import, come faceva AuthManager() prima di questa
# suddivisione in moduli (vedi CLAUDE.md, sezione Architettura).
state = load_state()
