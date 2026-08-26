"""
routers/ — endpoint HTTP di YTProxy, un APIRouter per dominio.

Prima erano tutti in un unico main.py da 55 funzioni: per restare sotto le 5
funzioni per file (vedi CLAUDE.md) ogni dominio ha il proprio modulo, incluso
nell'app da main.py.

  search.py            ricerca e autocomplete
  status.py             /api/health, /api/lan-address
  watch.py               metadati video + sottotitoli
  streaming.py            /api/mux, /api/download (remux ffmpeg)
  comments.py              lettura/pubblicazione commenti
  auth_oauth.py             stato auth, device flow, logout, identità
  subscription_guards.py    permessi condivisi da subscriptions.py
  subscriptions.py           iscrizioni: elenco, stato, iscriviti/disiscriviti
  feeds.py                    home, iscrizioni, correlati, canale, loghi
  cookies.py                   cookies.txt manuale + import dal browser
  history.py                    cronologia locale
  prefs.py                      preferenze utente
  spa.py                         route "finte" del frontend + static files
"""
