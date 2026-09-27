"""
feed_cookie.py — ciclo in background che tiene fresco il feed 'Iscrizioni'
dei cookie (auth/cookie_feed.py): lo riscarica appena la copia in memoria
scade, così aprire le Iscrizioni non aspetta mai l'estrazione di yt-dlp.

Separato da scheduler.py: quello gira ogni ora e solo con l'OAuth, questo
ogni COOKIE_FEED_CACHE_TTL e solo coi cookie — due autenticazioni
indipendenti (vedi CLAUDE.md). Al primo giro, all'avvio del server, la copia
non c'è ancora: si scarica subito, e anche la prima apertura trova il feed
pronto.
"""
import asyncio
import time

from auth import cookie_feed
from auth.config import COOKIE_FEED_CACHE_TTL
from auth.cookies import get_cookie_path

# Pausa minima fra due controlli: senza cookie (o subito dopo averli
# importati) il giro costa solo uno stat del file, e un minuto basta perché
# un cookies.txt nuovo venga scaricato presto.
_PAUSA_MIN_S = 60

_task = None


def avvia(state, ydl_opts_fn):
    """Avvia il ciclo (una volta sola, da core/startup.py)."""
    global _task
    if _task and not _task.done():
        return
    _task = asyncio.create_task(_ciclo(state, ydl_opts_fn))


def _attesa(state) -> float:
    """Secondi fino alla scadenza della copia in memoria, fra _PAUSA_MIN_S e COOKIE_FEED_CACHE_TTL."""
    resta = COOKIE_FEED_CACHE_TTL - (time.time() - state.cookie_feed_cache_at)
    return min(max(resta, _PAUSA_MIN_S), COOKIE_FEED_CACHE_TTL)


async def _ciclo(state, ydl_opts_fn):
    """
    Allo scadere riscarica, poi dorme fino alla prossima scadenza. Passa
    dallo stesso aggiorna_in_background delle richieste: se una pagina ha
    già fatto partire l'aggiornamento, lo aspetta invece di farne un altro.
    Un aggiornamento fallito sposta da sé la scadenza (COOKIE_FEED_RIPROVA_S),
    quindi un errore che dura non diventa un giro al minuto.
    """
    while True:
        if get_cookie_path() and cookie_feed.scaduta(state):
            try:
                await asyncio.shield(cookie_feed.aggiorna_in_background(state, ydl_opts_fn))
            except Exception as e:  # il ciclo non deve morire: senza, niente più aggiornamenti
                print(f"[sync] Feed iscrizioni (cookie) non aggiornato: {e}")
        await asyncio.sleep(_attesa(state))
