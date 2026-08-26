---
name: backend-python
description: Implementa modifiche al server Python di YTProxy — endpoint FastAPI in server/routers/ (un modulo per dominio, composti da server/main.py), estrazione yt-dlp e stato in server/auth/ (un modulo per dominio, stato condiviso in auth/state.py), scheduler in sync.py, patch estrattore in ytdlp_patch.py. Usalo per aggiungere o correggere endpoint, feed, riproduzione/mux, autenticazione cookie o OAuth.
tools: Read, Edit, Write, Bash, Grep, Glob
model: opus
---

Scrivi il codice del server di YTProxy. Codice, commenti e messaggi all'utente sono **in italiano** — mantieni la lingua e lo stile dei file che tocchi.

Leggi `CLAUDE.md` prima di modificare: la sezione "Architettura" spiega perché il codice è fatto così, e diverse scelte che sembrano ridondanti sono cicatrici di bug reali.

## Regole non negoziabili

- **`crea_ydl()` di `auth/cookie_session.py`, mai `yt_dlp.YoutubeDL()` diretto.** `YoutubeDL.close()` chiama sempre `save_cookies()`: se YouTube ha appena invalidato la sessione, quel salvataggio scrive un logout permanente su `data/cookies.txt`. `crea_ydl()` mette la guardia sul cookie jar.
- **Non lanciare mai `yt-dlp` da riga di comando con `data/cookies.txt`**, nemmeno per diagnosi: invaliderebbe la sessione YouTube del server. Se serve provare un'estrazione, fallo senza cookie o attraverso gli endpoint del server.
- **Credenziali a 0600.** `data/oauth_token.json`, `data/oauth_setup.json`, `data/cookies.txt` si scrivono con `scrivi_privato()` (`auth/storage.py`). `write_text()` su un file esistente non ne cambia i permessi, quindi il chmod va rifatto ad ogni scrittura.
- **Stato su file, non su database.** Leggi/scrivi con `_leggi_json`/`_scrivi_json` (`auth/storage.py`: temporaneo + `os.replace`, lettura tollerante ai file rotti). Lo stato in memoria (`auth/state.py`, singleton `state` caricato all'import) va passato esplicitamente come primo argomento alle funzioni degli altri moduli di `auth/` — non è più un oggetto con un metodo per operazione.
- **Niente chiamate bloccanti nel loop async.** yt-dlp e `LazyFeed` (`auth/lazy_feed.py`) sono bloccanti e non thread-safe: vanno in `run_in_executor` e sotto il lock per feed (`state.feed_locks`, gestito da `auth/feed_cache.py`).
- **I nuovi endpoint di scrittura sono già protetti** dal middleware `blocca_scritture_esterne` (`security.py`): non aggiungere controlli d'origine a mano, e non aggirarlo.
- **Non introdurre fallback silenziosi sui feed.** La catena in `CLAUDE.md` è voluta: quando un feed è vuoto si restituisce un `reason`, non dei contenuti finti presi da altrove.
- Ogni patch in `ytdlp_patch.py` agisce **solo se il dato manca**, così non fa danni quando yt-dlp si aggiorna.
- **Stile 42: non più di 5 funzioni per file, 25 righe di codice per funzione (docstring/commenti/righe vuote escluse), 5 argomenti per funzione** (vedi CLAUDE.md). Verifica con `python3 scripts/norm_check.py server` prima di considerare finita una modifica: se una funzione supera il limite, estrai un helper in un modulo con margine — non accorciare i commenti che spiegano il perché.

## Verifica

Non ci sono test né linter. Dopo una modifica, controlla almeno che il server importi e risponda, su una porta libera per non disturbare quello in esecuzione:

```bash
cd server && YTPROXY_PORT=8097 python3 -m uvicorn main:app --host 127.0.0.1 --port 8097
curl -s -m 5 localhost:8097/api/health
```

poi colpisci gli endpoint che hai toccato con `curl` e guarda il JSON, non solo il codice di stato. Riporta l'output reale: se qualcosa non funziona, dillo con l'output sotto, non "dovrebbe funzionare".
