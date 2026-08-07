# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Cos'è

YTProxy: server locale (FastAPI + yt-dlp) che serve un clone dell'UI di YouTube senza pubblicità, raggiungibile da PC, telefono e Smart TV sulla stessa rete. Codice, commenti e UI sono in italiano — mantieni la lingua quando modifichi.

## Comandi

```bash
# Avvio completo (installa dipendenze di sistema/Python, aggiorna yt-dlp una volta al giorno,
# builda il frontend se manca dist/, poi uvicorn su 0.0.0.0:8090 --reload)
./start_server.sh                      # start_server.bat su Windows

# Solo server (dipendenze già presenti)
cd server && python3 -m uvicorn main:app --host 0.0.0.0 --port 8090 --reload

# Frontend con HMR su :3000 (proxy /api → :8090, quindi il server deve girare a parte)
cd frontend && npm run dev

# Build frontend → frontend/dist (servito da FastAPI su /)
cd frontend && npm run build

# App desktop Electron (avvia da sé il server Python)
npm install && npm run build:frontend && npm start
npm run build                          # electron-builder → dist-electron/

# APK Android (Capacitor)
./build_apk.sh                         # tutta la catena, APK copiato in ./YTProxy.apk
./build_apk.sh --install               # e lo installa via adb sul telefono collegato
# a mano:
cd frontend && npm run build && npx cap sync android && cd android && ./gradlew assembleDebug
```

Non ci sono test né linter configurati. Per verificare a mano: `curl -s localhost:8090/api/health`, `curl -s "localhost:8090/api/watch/<id>?quality=720"`.

`frontend/dist/` **è versionato** (il server lo serve così com'è): dopo aver toccato il frontend serve `npm run build` e i file buildati vanno committati. `frontend/node_modules/` e i file personali in `data/` sono invece ignorati.

## Architettura

Un unico processo FastAPI fa sia API sia hosting dei file statici. Non esiste database: tutto lo stato sta in file JSON dentro `data/`.

- `server/main.py` — endpoint HTTP + selettori di formato yt-dlp + mount di `frontend/dist` su `/`.
- `server/auth.py` — `auth_manager` (singleton): OAuth Google, cookie YouTube, feed, cronologia, preferenze, cache loghi canale. Carica tutti i JSON in memoria all'avvio e riscrive il file intero ad ogni modifica — con `_scrivi_json`/`_leggi_json`, cioè scrittura su temporaneo + `os.replace` e lettura che tollera un file rotto (lo sposta in `.corrotto` e riparte dal default). Serve perché `AuthManager()` è costruito all'import: con `write_text` diretta e `json.loads` nudo, un kill a metà salvataggio impediva l'avvio del server.
- `server/sync.py` — `scheduler` (singleton): loop orario che rinnova le iscrizioni via API e ricostruisce la cache del feed iscrizioni. Avviato da `on_startup`.
- `server/ytdlp_patch.py` — correzioni all'estrattore di yt-dlp, applicate all'avvio da `main.py`. Oggi una sola: l'id del canale nelle card dei video in collaborazione, che yt-dlp non trova (vedi il docstring). Ogni patch agisce solo se il dato manca, così non fa danni quando yt-dlp si aggiorna.

**yt-dlp è l'unica fonte dei dati YouTube** (niente API key per ricerca/trending/video/commenti/sottotitoli). La YouTube Data API v3 serve solo per le iscrizioni (elenco, iscriversi, disiscriversi) e i loghi dei canali, e richiede l'OAuth.

### Riproduzione: tre selettori di formato, tre scopi

`_progressive_format_selector` / `_adaptive_format_selector` / `_cast_format_selector` in `main.py` non sono intercambiabili — i docstring spiegano il perché (player `<video>` che non gestisce flussi separati, Chromecast che non decodifica AV1/Opus). Il player reale usa **`/api/mux`**: ffmpeg unisce al volo video+audio adattivi in un MP4 frammentato (`-c copy`, `frag_duration` 1s). Conseguenza da tenere a mente: niente `Content-Length`/Range, quindi il `<video>` da solo non sa cercare oltre il buffer. Il seek si fa con il parametro **`start`**: il player riapre il flusso dal secondo richiesto (ffmpeg `-ss` prima degli input, più `-copypriorss 0` per non partire dal keyframe precedente) e mostra `start + currentTime` — vedi `VideoPlayer.jsx`, che per questo ha una barra e dei controlli propri invece di quelli nativi. `/api/watch` resta per i metadati (e restituisce anche uno stream progressivo di riserva).

**`/api/download` usa lo stesso meccanismo** (ffmpeg in sola copia verso la pipe, helper condiviso `_ffmpeg_pipe_response`) ma con `Content-Disposition: attachment` e i codec compatibili del Chromecast: un file che si conserva deve aprirsi anche fuori da un browser aggiornato, e il meglio assoluto di YouTube è AV1+Opus. Non scrive niente su disco — la vecchia cache in `/tmp/ytproxy_cache` accumulava video interi per sempre e la si cancella all'avvio (`_pulisci_cache_download`).

La stessa mancanza di Range si porta dietro la trappola più insidiosa: **`video.seekable` è vuoto** (Chrome lo espone come `[0,0]`), e su un elemento così ogni `currentTime = x` viene *schiacciato a zero* invece di fallire. Il player aveva una scorciatoia — "se il punto è già in `buffered`, sposta `currentTime` e non riaprire niente" — che quindi non spostava un bel niente: riportava il video all'inizio del flusso mentre la barra mostrava il punto chiesto. Si vedeva su ogni salto corto (barra mossa di poco, tasti ← →, doppio tocco sul telefono), mai su quelli lunghi, che uscendo dal buffer prendevano già la strada della riapertura. Da qui `isSeekable()` accanto a `isBuffered()` in `VideoPlayer.jsx`, più la rilettura di `currentTime` subito dopo averlo scritto: se il salto non è andato a segno si riapre il flusso. In pratica oggi **ogni** salto riapre il flusso; la scorciatoia resta solo per i browser che dichiarino davvero un intervallo cercabile.

Da lì discende anche una trappola sulla velocità di riproduzione (menu rotellina → "Riproduzione veloce", e il 2x tenendo premuto sul video): siccome ogni salto riapre il flusso con `load()`, e `load()` riporta `playbackRate` a `defaultPlaybackRate`, la velocità va riapplicata dopo ogni riapertura. In `VideoPlayer.jsx` lo fa un effect che dipende anche da `stream` ed è dichiarato **dopo** quello del caricamento — l'ordine conta, altrimenti scriverebbe la velocità prima di `load()` e verrebbe azzerata subito.

### Due autenticazioni indipendenti, entrambe facoltative

| | A cosa serve | Dove |
|---|---|---|
| `data/cookies.txt` | Feed home reale e feed iscrizioni reale (via yt-dlp) | upload manuale o import automatico dal browser (`/api/cookies/import`, gestisce i percorsi snap su Linux) |
| OAuth Google | Elenco iscrizioni + loghi canale (Data API v3), iscriversi/disiscriversi da un canale, lettura/pubblicazione commenti | l'utente crea il proprio Client ID di tipo "TV e dispositivi con input limitato"; device flow su `/api/auth/device/*` |

Sui cookie c'è una trappola che vale la pena ricordare: contano solo quelli di **prima parte sul dominio `youtube.com`** (`SID`, `__Secure-1PSID`, `LOGIN_INFO`, `SAPISID`). Essere loggati su `google.com` non basta — un profilo browser loggato su Google ma che non ha mai aperto YouTube produce un `cookies.txt` di decine di cookie in cui YouTube ti vede comunque anonimo, quindi feed vuoti. `_youtube_auth_cookies()` in `auth.py` è il controllo che distingue i due casi, e `get_cookie_status()` lo espone come `logged_in`.

Da quella trappola discende una regola: **yt-dlp si istanzia sempre con `crea_ydl()` (`auth.py`), mai con `yt_dlp.YoutubeDL()`**. `YoutubeDL.close()` chiama sempre `save_cookies()`, quindi ogni estrazione riscrive `cookies.txt` con il jar che ha in memoria — e se YouTube ha appena invalidato la sessione quel jar contiene un logout, che così diventa permanente sul file. `crea_ydl()` mette il controllo sul cookie jar: la rotazione normale dei cookie si salva, la cancellazione della sessione no.

Senza nessuna delle due, ricerca, trending e riproduzione funzionano lo stesso.

**L'OAuth usa il device flow, e non è un dettaglio estetico.** Il flow web classico ha un redirect URI, e Google per l'`http://` accetta solo `localhost`/`127.0.0.1` — gli IP privati li rifiuta come URI autorizzato. Quindi con il server su un'altra macchina della rete (Raspberry, NAS) il redirect rimanda il browser al `localhost` di *chi sta guardando*, dove non c'è nessun server: la schermata di consenso passa e subito dopo la pagina non carica, sintomo che sembra una caduta di rete. Il device flow (`start_device_flow` / `poll_device_token` in `auth.py`) non ha redirect: il server chiede un codice, l'utente lo digita su `google.com/device` da un dispositivo qualsiasi, il server intanto fa polling. Funziona identico su localhost, su IP di LAN e in headless. Il vecchio flow (`/api/auth/url` + `/api/auth/callback-page`) resta nel codice per chi ha già un client "Applicazione web" collegato, ma l'UI non lo usa più.

Le due azioni che *scrivono* su YouTube — pubblicare un commento e iscriversi/disiscriversi da un canale — richiedono lo scope `youtube.force-ssl` (`WRITE_SCOPE` in `auth.py`, esposto come `can_write()` e come `can_comment`/`can_subscribe` in `/api/auth/status`). Chi si era collegato quando l'app leggeva soltanto ha un refresh token senza quello scope: continua a leggere le iscrizioni ma riceve 403 `insufficientPermissions` finché non rifà il login. Lo stato "sono iscritto a questo canale?" (`/api/subscriptions/status/<id>`) si legge invece dalla copia locale `data/subscriptions.json`, non da YouTube: iscriversi e disiscriversi costano 50 unità di quota ciascuna, aprire una pagina canale non deve costarne nessuna.

### Fallback dei feed (catena voluta, non accidentale)

- Home: **solo** `/api/feed/home` (cookie, `LazyFeed`). Nessun fallback: se il feed è vuoto l'endpoint restituisce `reason` (`no-cookies` / `not-logged-in` / `feed-vuoto`) e la home lo spiega, invece di mostrare i trending fingendo che sia la tua home. `/api/trending` esiste ancora ma non è più nella catena della home. YouTube però chiude le continuazioni della home presto (misurato: ~200-350 video, non il tetto `FEED_MAX`), quindi quando il generatore finisce il feed viene **riaperto** daccapo: una nuova estrazione dà una lista in buona parte diversa (~100 video mai visti su ~280) e gli id già serviti vengono saltati. Vedi `LazyFeed._rigenera`, `FEED_REFILL_MAX`; vale solo per la home, perché riaprire un canale o un Mix ridarebbe la stessa lista.
- Correlati: `/api/related/<id>` legge il "Mix" di YouTube (playlist `RD<id>`) con lo stesso `LazyFeed` — si estende con continuazioni quasi senza fine, quindi regge lo scroll infinito della sidebar. YouTube però il Mix non lo genera per i video poco visti o dei canali piccoli (yt-dlp avvisa `Unable to recognize playlist`): in quel caso si ripiega su una ricerca per titolo del video, e la risposta lo dichiara in `source` (`mix` / `ricerca` / `nessuna`).
- Iscrizioni: feed cookie di YouTube (cache 5 min) → cache su disco aggiornata ogni ora da `sync.py` → fetch a caldo ridotto (15 canali) se la cache è ancora vuota. Le due metà della pagina Iscrizioni hanno autenticazioni diverse e ognuna funziona da sola — l'elenco dei canali viene dall'OAuth, il feed dai cookie — quindi `SubscriptionsPage` si dichiara vuota solo se mancano entrambe, e la scheda "Canali" c'è solo con l'OAuth.
- `sync_subscriptions` sostituisce `subscriptions.json` **solo** se la scansione arriva all'ultima pagina: una lista parziale (quota finita, token revocato a metà) non è meglio di niente, cancellerebbe i canali delle pagine mancanti.
- Canale: `/api/channel/<id>/videos` pagina la scheda "Video" con lo stesso `LazyFeed` e restituisce in `channel` anche l'intestazione (nome, logo, copertina, iscritti), che arriva gratis dalla stessa estrazione. Le voci di quella scheda non ripetono l'autore, quindi il nome canale viene riempito dai metadati della lista.

`LazyFeed` (in `auth.py`) tiene vivo il generatore di yt-dlp tra una richiesta e l'altra per scaricare il feed a blocchi mentre l'utente scorre. È bloccante e non thread-safe: gli accessi passano da un lock per feed (`_feed_locks`, uno per chiave — `home`, `related:<id>`, `channel:<id>`) e girano in `run_in_executor`. I feed aperti stanno in una cache LRU (`_feeds`, max `MAX_OPEN_FEEDS`) perché ognuno tiene viva un'istanza di yt-dlp. Chiama `save_cookies()` ad ogni blocco perché YouTube ruota i cookie di sessione e non farlo invalida la sessione.

### Frontend

React 18 + Vite, senza router né librerie di stato. `App.jsx` implementa il routing a mano sulla History API. **Aggiungere una pagina richiede tre modifiche coerenti**: `pageToUrl`/`urlToPage` in `App.jsx`, il rendering condizionale in `App.jsx`, e la route corrispondente in `spa_routes()` di `main.py` (senza quest'ultima, aprire l'URL diretto o ricaricare dà 404).

Le preferenze salvate sul server stanno nel context `usePrefs` (`hooks/usePrefs.jsx`), non nei singoli componenti: da lì le legge il player (qualità predefinita, autoplay) e il tema, che diventa l'attributo `data-theme` su `<html>` (palette chiara e scura in `App.css`; il player resta scuro in entrambi i temi, come su YouTube, perché i suoi comandi stanno sopra il video). Una scelta fatta a mano dal menu del player ha la precedenza sulla preferenza fino a fine sessione — vedi `qualitaScelta` in `VideoPage.jsx`. La preferenza autoplay decide solo se un video *appena aperto* parte da solo: le riaperture del flusso dovute a un salto o a un cambio di qualità ripristinano lo stato di prima, altrimenti spostare la barra di un video in pausa lo farebbe ripartire (`andavaRef` in `VideoPlayer.jsx`).

`api.js` centralizza le chiamate e il rilevamento del dispositivo. `getServerBase()` è vuoto sul web/Electron (stessa origine) ma su Android/Capacitor legge da localStorage l'indirizzo impostato in `ServerSetup`; `getLanBase()` serve al Chromecast, che scarica il video da sé e quindi ha bisogno di un URL assoluto e non-localhost.

Sull'APK c'è una trappola legata a quell'indirizzo: `capacitor.config.json` deve tenere `server.androidScheme: "http"`. Di default Capacitor serve la WebView su `https://localhost`, e da un'origine https ogni chiamata a `http://<ip-del-pc>:8090` è **contenuto misto**, che la WebView blocca in silenzio (`allowMixedContent` è `false` di default: `Bridge.initWebView()` chiama `setMixedContentMode(ALWAYS_ALLOW)` solo se attivo). Il sintomo è inconfondibile — dal browser del telefono il server si apre, dall'app no, e l'onboarding dice "non raggiungibile" anche con l'IP giusto. Non basta `usesCleartextTraffic="true"` nel manifest: quello autorizza l'HTTP in chiaro, non lo sblocca da un'origine sicura. Nota che cambiare schema cambia l'origine, quindi chi aggiorna l'APK perde l'indirizzo salvato in localStorage e deve reinserirlo una volta.

Seconda trappola dell'APK, sullo schermo intero: `BridgeWebChromeClient` di Capacitor ridefinisce `onShowCustomView` ma dentro chiama subito `onCustomViewHidden()`, cioè annulla la richiesta di schermo intero della pagina. Le due ridefinizioni gli servono solo perché Android, via reflection, concede lo schermo intero alla WebView unicamente se il client dichiara di gestirlo. Risultato: il video si allargava dentro la finestra dell'app ma barra di stato e barra di navigazione restavano lì sopra. `FullscreenWebChromeClient` (in `android/.../com/ytproxy/app/`) estende quella classe, attacca davvero la vista che la WebView passa e nasconde le barre finché lo schermo intero dura; `MainActivity` lo installa in `onCreate` — non più tardi, perché il costruttore di Capacitor registra dei launcher di activity result, vietati a activity già avviata.

Il Cast (`hooks/useCast.jsx`) funziona solo su Chrome/Edge/Brave desktop — non in Electron, non in Chromium open-source — e l'hook espone il motivo dell'indisponibilità per poterlo spiegare all'utente. L'unico comando è `CastButton` nella pagina video: sempre visibile, spiega il motivo invece di sparire quando il cast non è disponibile.

## Nota sulla porta 8090

È ripetuta in più punti che devono restare allineati: `SERVER_PORT` in `main.py` (override con `YTPROXY_PORT`), il proxy in `frontend/vite.config.js`, `electron/main.js`, `start_server.sh`/`.bat`. Su Google Cloud Console invece non va più registrata: col device flow non c'è nessun redirect URI (conta solo per il vecchio flow web, rimasto per retrocompatibilità).
