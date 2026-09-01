---
description: Verifica che le modifiche pendenti siano pronte per il commit (rebuild dist/, norm_check, controlli del repo)
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(python3 scripts/norm_check.py:*), Bash(bash scripts/rebuild_frontend.sh), Read, Grep, Glob
---

Controlla se le modifiche pendenti sono pronte per il commit. **Non committare**, riporta solo l'esito.

## Stato attuale

- `git status --short`: !`git status --short`
- `git diff --stat`: !`git diff --stat`

## Passi

1. **Rebuild frontend**: se il diff tocca `frontend/src/`, `frontend/index.html`, `frontend/vite.config.js` o `frontend/package.json` ma non `frontend/dist/`, lancia `bash scripts/rebuild_frontend.sh` e verifica che `frontend/dist/` sia cambiato. `dist/` è versionato ed è quello che il server serve.
2. **norm_check**: lancia `python3 scripts/norm_check.py`. Ogni violazione va sistemata prima del commit (la correttezza vince sul conteggio: se un vincolo documentato lo impone, si lascia il file fuori norma con un commento che lo spiega — vedi CLAUDE.md).
3. **Pagina nuova**: se il diff aggiunge una pagina, verifica le tre modifiche coerenti — `pageToUrl`/`urlToPage` in `frontend/src/App/routing.js`, il rendering in `frontend/src/App/AppRoutes.jsx`, la route in `spa_routes()` di `server/routers/spa.py`.
4. **Porta 8090**: se è cambiata da qualche parte, deve essere allineata in `server/core/config.py`, `frontend/vite.config.js`, `electron/main.js`, `scripts/start_server.sh`/`.bat`, `docker/Dockerfile`, `docker/docker-compose.yml`.
5. **crea_ydl**: se il diff istanzia `yt_dlp.YoutubeDL(` direttamente invece di `crea_ydl()`, segnalalo.
6. **Segreti**: nessun contenuto di `data/cookies.txt`, token OAuth o client secret nel diff.
7. **COLLAUDO.md**: se la modifica aggiunge/cambia/rimuove una feature, `DOCS/COLLAUDO.md` va aggiornato nello stesso commit.

## Resoconto

Elenco puntato: per ogni passo OK / da sistemare, con il comando che lo dimostra. Chiudi con "pronto per il commit" oppure con la lista di cosa manca.

$ARGUMENTS
