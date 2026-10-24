# CLAUDE.md

YTProxy: server locale (FastAPI + yt-dlp) che serve un clone dell'UI di YouTube senza pubblicità a PC, telefono (APK Capacitor), Electron e Smart TV sulla stessa rete. Codice, commenti e UI sono in italiano: mantieni la lingua.

## Comandi

```bash
./scripts/start_server.sh                      # avvio completo su 0.0.0.0:8090
cd server && python3 -m uvicorn main:app --host 0.0.0.0 --port 8090 --reload
cd frontend && npm run dev                     # HMR su :3000, proxy /api → :8090
cd frontend && npm run build                   # → frontend/dist (servito da FastAPI)
./scripts/build_apk.sh [--install]             # APK Android
npm install && npm run build:frontend && npm start   # Electron
make up / make logs / make down                # Docker (file in docker/, dati in ./data)

python3 -m pytest                              # backend, offline (-m rete per YouTube vero)
cd frontend && npm run test:e2e                # Playwright su server offline :8098, usa dist/
python3 scripts/norm_check.py [percorso]       # regola di stile
```

## Regole

- **Stile 5/25/5**: per file Python/JS/JSX al massimo 5 funzioni, 25 righe di codice per funzione (commenti e docstring esclusi), 5 argomenti (`self` escluso). Vale anche per i test. CSS escluso. Se un vincolo di correttezza confligge, vince la correttezza e si lascia un commento (es. `components/VideoPlayer/index.jsx`). L'hook `PostToolUse` lancia `norm_check.py` sul file toccato.
- **`frontend/dist/` è versionato**: dopo aver toccato `frontend/src` serve `npm run build` (lo fa anche l'hook `Stop`), e `dist/` va nello stesso commit dei sorgenti. Prima dei test e2e, ribuilda.
- **yt-dlp si istanzia solo con `crea_ydl()`** (`auth/cookie_session.py`), mai `yt_dlp.YoutubeDL()`: altrimenti un logout di YouTube viene salvato su `cookies.txt`.
- **Pagina SPA nuova = tre modifiche**: `App/routing.js`, `App/AppRoutes.jsx`, `spa_routes()` in `server/routers/spa.py` (vedi `/nuova-pagina`).
- **Porta 8090** ripetuta in `server/core/config.py`, `frontend/vite.config.js`, `electron/main.js`, `scripts/start_server.*`, `docker/Dockerfile`, `docker/docker-compose.yml`: tienili allineati.
- **`DOCS/COLLAUDO.md`**: elenco delle feature con la condizione che le dichiara funzionanti. Chi cambia una feature aggiorna la voce (e il test, se automatizzabile) nello stesso commit.
- File con credenziali (`data/oauth_token.json`, `oauth_setup.json`, `cookies.txt`) si scrivono con `scrivi_privato()` (`auth/storage.py`, permessi 0600).
- I test non toccano mai `data/` vero: `conftest.py` imposta `YTPROXY_DATA` prima di importare il server.

## Git

- Mai lavorare su `main`: un branch per task (`feat/`, `fix/`, `refactor/`, `docs/` + descrizione in italiano con trattini), creato prima della prima modifica. Il merge lo fa l'utente.
- Commit piccoli e ognuno verde (`norm_check`, `pytest`, `dist/` aggiornato). Prima: `/commit-ready`, e `revisore` per modifiche non banali. Committa solo la sessione principale.
- `git add` per percorso, mai `-A`/`.`. Mai committare `data/`, `.env`, `.claude/settings.local.json`, media di prova.
- Conventional Commits in italiano; scope: `server`, `auth`, `feed`, `player`, `frontend`, `apk`, `electron`, `docker`, `scripts`. Il corpo spiega il perché.
- Vietati senza richiesta esplicita: `push`, `reset --hard`, `clean`, rebase/amend di commit pushati, cancellare branch, scartare modifiche non committate.
- Sessioni parallele: `git worktree add ../ytproxy-<task> -b feat/<task>`, con `YTPROXY_PORT` diverso, una copia di `data/` (non condivisa) e `npm install`.

## Architettura

Un solo processo FastAPI per API e file statici; niente database, lo stato è in JSON dentro `data/`.

- `server/main.py` solo cablaggio; `server/routers/` un router per dominio; `server/auth/` logica per dominio con lo stato singleton `AuthState` (`auth/state.py`, caricato all'import) passato come primo argomento; `server/sync/` scheduler orario delle iscrizioni; `server/core/` sicurezza/config/avvio; `server/ytdlp/` helper, selettori di formato, patch, proxy a blocchi. Le mappe dei moduli sono nei docstring di `routers/__init__.py` e `auth/__init__.py`.
- **yt-dlp è l'unica fonte dati YouTube.** La Data API v3 (OAuth device flow, client "TV e dispositivi con input limitato") serve solo a iscrizioni, loghi, commenti, «mi piace». I cookie (`data/cookies.txt`) servono ai feed home e iscrizioni. Entrambi facoltativi.
- **Riproduzione**: `/api/mux` unisce video+audio con ffmpeg in MP4 frammentato verso una pipe (niente Range): il seek riapre il flusso con `start=`. Il player usa MSE con timeline sorgente (`tempi=sorgente`), ripiego `<video src>`. Le trappole di sincronia A/V, seek, velocità e SponsorBlock sono documentate nei docstring di `server/routers/streaming.py`, `ffmpeg_pipe.py`, `ytdlp/proxy_blocchi.py` e nei file di `components/VideoPlayer/`: leggili prima di toccare il player.
- **Sicurezza**: nessun login; `blocca_scritture_esterne` (`core/security.py`) rifiuta POST/PUT/PATCH/DELETE con `Origin` non locale. Origini extra in `YTPROXY_ALLOWED_ORIGINS`.
- **Frontend**: React 18 + Vite, routing a mano sulla History API in `App/`, chiamate in `api/`, preferenze nel context `hooks/usePrefs.jsx`. I file grossi sono pacchetti (`Foo/index.jsx`). Immagini YouTube sempre via `proxyImg()` (`/api/img`), font impacchettati: l'APK può stare su una LAN senza DNS pubblico.
- **APK**: `capacitor.config.json` deve tenere `androidScheme: "http"` (altrimenti contenuto misto bloccato).

## Subagent e strumenti

Agenti in `.claude/agents/`: `architetto` (piano), `backend-python`, `frontend-react` (implementazione), `revisore` (rilettura), `collaudo-api` (verifica). Comandi: `/commit-ready`, `/nuova-pagina`, `/collaudo`. MCP `playwright` (`.mcp.json`) per i controlli di UI dalla sessione principale.
