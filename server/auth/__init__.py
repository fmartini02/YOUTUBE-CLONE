"""
auth/ — Google OAuth2 + Cookie management, in moduli.

Prima era un unico auth.py con una classe AuthManager da 66 metodi: per
restare sotto le 5 funzioni per file (vedi CLAUDE.md) è stato spezzato in
moduli per dominio, con lo stato condiviso in `state.py` passato come primo
argomento invece che tenuto su un oggetto con un metodo per ogni operazione —
altrimenti il problema si sarebbe solo spostato dal file alla classe.

Mappa dei moduli:
  storage.py              percorsi dati, scrittura/lettura JSON atomica
  config.py                costanti di tuning (feed, OAuth, cache)
  errors.py                 YouTubeAPIError
  state.py                  AuthState (stato in memoria) + load_state()
  mapping.py                voce grezza di yt-dlp -> formato frontend
  cookie_session.py         sessione cookie YouTube, crea_ydl()
  lazy_feed.py               LazyFeed: estrazione pigra a blocchi
  feed_cache.py              cache LRU dei LazyFeed aperti + lock
  feed_pager.py               paginazione pigra condivisa (home/correlati/canale)
  feed_home.py, feed_related.py, feed_channel.py, feed_subscriptions.py
                              le quattro sorgenti di feed
  oauth_flow.py               device flow: ottenere/rinnovare il token
  oauth_status.py             autenticato? può scrivere?
  yt_api.py                   chiamata autenticata generica alla Data API
  identity.py                  canale dell'account collegato
  comments.py, comment_posting.py   lettura e pubblicazione commenti
  subscriptions_sync.py, subscriptions_state.py, subscriptions_actions.py
                              sync completa, copia locale, iscriviti/disiscriviti
  cookies.py, cookies_import.py    cookies.txt manuale e import dal browser
  history.py                  cronologia locale
  prefs.py                    preferenze utente
  channel_avatars.py          loghi canale in batch, con cache

Il singleton "auth_manager" di prima è ora `from auth.state import state`.
"""
