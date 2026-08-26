"""feed_cache.py — cache LRU dei LazyFeed aperti e dei lock per feed."""
from auth.config import MAX_OPEN_FEEDS


def drop_feed(state, key: str):
    """Chiude e dimentica un feed aperto, se c'è."""
    feed = state.feeds.pop(key, None)
    if feed is not None:
        feed.close()


def pota_lock(state, key: str):
    """
    Toglie il lock di un feed che non è più aperto.

    Un lock per feed serve finché il feed esiste; le chiavi però contengono
    id di video e di canale, quindi tenerli tutti significa una voce in più
    ad ogni video di cui si aprono i correlati — un dizionario che in una
    sessione lunga arriva a migliaia di lock inutili.

    Si toglie solo se è libero: `locked()` è vero anche quando qualcuno è
    in attesa, quindi un lock che serve ancora a una richiesta in corso non
    viene mai rimosso da sotto i piedi.
    """
    if key in state.feeds:
        return
    lock = state.feed_locks.get(key)
    if lock is not None and not lock.locked():
        state.feed_locks.pop(key, None)


def invalidate_feeds(state):
    """
    Butta via tutti i feed aperti.

    Serve quando cambiano i cookie: ogni LazyFeed tiene viva un'istanza di
    yt-dlp con la sessione di PRIMA: senza questa chiamata, reimportare i
    cookie non aveva effetto sulla home finché il feed non scadeva da solo.

    Chi reimporta i cookie deve chiamarla PRIMA di scrivere il file nuovo:
    chiudere un feed fa salvare a yt-dlp la sua copia dei cookie, che
    sovrascriverebbe quelli appena importati con quelli della sessione
    vecchia.
    """
    for key in list(state.feeds):
        drop_feed(state, key)
        pota_lock(state, key)


def _libero(state, key):
    lock = state.feed_locks.get(key)
    return lock is None or not lock.locked()


def remember_feed(state, key: str, feed):
    """
    Segna il feed come usato di recente, chiudendo i meno usati oltre il
    limite: ogni istanza di yt-dlp tenuta viva costa memoria e socket.
    """
    state.feeds[key] = feed
    state.feeds.move_to_end(key)
    while len(state.feeds) > MAX_OPEN_FEEDS:
        # Salta i feed con il lock preso: un'altra richiesta li sta usando
        # proprio ora e chiuderli le farebbe fallire lo scroll.
        evictable = [k for k in state.feeds if _libero(state, k)]
        if not evictable:
            break
        old_key = evictable[0]
        old = state.feeds.pop(old_key)
        state.feed_locks.pop(old_key, None)
        old.close()
