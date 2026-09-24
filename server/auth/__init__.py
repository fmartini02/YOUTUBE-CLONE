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
  mapping_search.py         voce di una ricerca -> card video/canale/playlist
  cookie_session.py         sessione cookie YouTube, crea_ydl()
  lazy_feed.py               LazyFeed: estrazione pigra a blocchi
  feed_cache.py              cache LRU dei LazyFeed aperti + lock
  feed_pager.py               paginazione pigra condivisa (home/correlati/canale)
  feed_home.py, feed_related.py, feed_channel.py, feed_subscriptions.py,
  feed_playlist.py            le sorgenti di feed (home, correlati, canale,
                              iscrizioni, playlist)
  playlist_mapping.py         intestazione di una playlist, voci "playlist"
  channel_playlists.py        scheda Playlist di un canale
  watch_later.py              coda locale "Guarda più tardi" (id WL)
  oauth_flow.py               device flow: ottenere/rinnovare il token
  oauth_status.py             autenticato? può scrivere?
  yt_api.py                   chiamata autenticata generica alla Data API
  identity.py                  canale dell'account collegato
  comments.py, comment_posting.py   lettura e pubblicazione commenti
  subscriptions_sync.py, subscriptions_state.py, subscriptions_actions.py
                              sync completa, copia locale, iscriviti/disiscriviti
  cookies.py, cookies_import.py    cookies.txt manuale e import dal browser
  history.py                  cronologia locale
  watch_progress.py           fin dove è stato visto un video (ripresa, barrette)
  prefs.py                    preferenze utente
  channel_avatars.py          loghi canale in batch, con cache
  channel_bubbles.py          canali attivi per la home + stato "canale visto"

Il singleton "auth_manager" di prima è ora `from auth.state import state`.
"""
