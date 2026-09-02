# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Cos'è

YTProxy: server locale (FastAPI + yt-dlp) che serve un clone dell'UI di YouTube senza pubblicità, raggiungibile da PC, telefono e Smart TV sulla stessa rete. Codice, commenti e UI sono in italiano — mantieni la lingua quando modifichi.

## Comandi

```bash
# Avvio completo (installa dipendenze di sistema/Python, aggiorna yt-dlp una volta al giorno,
# builda il frontend se manca dist/, poi uvicorn su 0.0.0.0:8090 --reload)
./scripts/start_server.sh              # scripts/start_server.bat su Windows

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
./scripts/build_apk.sh                 # tutta la catena, APK copiato in ./dist-android/YTProxy.apk
./scripts/build_apk.sh --install       # e lo installa via adb sul telefono collegato
# a mano:
cd frontend && npm run build && npx cap sync android && cd android && ./gradlew assembleDebug

# Docker (alternativa a scripts/start_server.sh — vedi sezione "Docker" più sotto; usa `make` o -f)
make up                                # build immagine + avvio, dati persistiti in ./data
make logs                              # output del server (al posto del terminale aperto)
make down                              # ferma; ./data resta sul disco
# equivalenti senza make:
docker compose -f docker/docker-compose.yml up -d --build
```

Non ci sono test né linter configurati. Per verificare a mano: `curl -s localhost:8090/api/health`, `curl -s localhost:8090/api/watch/<id>`. Al posto della suite di test c'è **`DOCS/COLLAUDO.md`**: l'elenco di tutte le feature con, per ognuna, la condizione osservabile che deve valere perché si possa dire che funziona. Il progetto non si dichiara collaudato finché quelle voci non hanno tutte un esito (OK / KO / non verificabile), e chi aggiunge o cambia una feature aggiorna il file nello stesso passaggio.

## Stile: 5 funzioni per file, 25 righe per funzione, 5 argomenti

Regola del progetto (ispirata alla norma 42): **nessun file Python o JS/JSX ha più di 5 funzioni/metodi/componenti**, **nessuna funzione supera le 25 righe di codice** (docstring, righe vuote e commenti non contano: la documentazione estesa in italiano è voluta, tagliarla per stare sotto soglia sarebbe peggio della violazione) **né i 5 argomenti** (`self` escluso). Eccezione dichiarata: i file di puro stile (CSS). `python3 scripts/norm_check.py` (senza argomenti verifica sia `server` che `frontend/src`, oppure si passa un percorso specifico) controlla entrambi: il backend Python con l'AST (`ast`, conteggio esatto), il frontend JS/JSX con un tokenizzatore euristico dedicato (`scripts/norm_check_js.py`, nessun vero parser disponibile) che si appoggia sulla formattazione a 2 spazi di Prettier per trovare le dichiarazioni di funzione a livello di modulo — è una rete, non una prova: due bug del tokenizzatore (un letterale regex scambiato per un commento, un apostrofo italiano scambiato per l'apertura di una stringa) sono stati trovati e corretti solo rileggendo a mano i falsi positivi che produceva.

Conseguenza diretta sulla struttura: `server/auth.py` e `server/main.py` di una volta (66 e 55 funzioni) sono oggi due pacchetti, `server/auth/` e `server/routers/` — vedi sotto. Lo stesso vale lato frontend per i file grossi: `api.js`, `App.jsx` e i componenti/pagine più corposi (`Comments.jsx`, `VideoPlayer.jsx`, `HomePage.jsx`, `ChannelPage.jsx`, `VideoPage.jsx`, `SettingsPage.jsx`, `SubscriptionsPage.jsx`...) sono oggi pacchetti (`api/`, `App/`, `components/VideoPlayer/`, `pages/VideoPage/`...), grazie alla risoluzione delle directory di Vite (`import ... from "./Foo"` continua a funzionare se `Foo.jsx` diventa `Foo/index.jsx`). Quando una funzione supera i limiti, la correttezza vince sempre sul conteggio: se un vincolo documentato confligge con lo stile, si lascia il file fuori norma con un commento che lo spiega, non si forza la modularizzazione a costo di romperlo — è il caso di `VideoPlayer` (`components/VideoPlayer/index.jsx`): l'ordine degli effect "caricamento" e "velocità" (vedi sotto) deve restare adiacente e nello stesso ordine nello stesso file, quindi il componente resta volutamente sopra le 25 righe mentre tutto il resto (helper puri, barra della velocità, menu impostazioni, barra pulsanti, overlay) vive negli altri file dello stesso pacchetto.

## Subagent

Dentro `.claude/` sono versionati (le uniche eccezioni alla riga `.claude/*` del `.gitignore`, vedi lì) tre percorsi, tutti conoscenza condivisa come questo file: `.claude/agents/` (i subagent), `.claude/commands/` (gli slash command), `.claude/settings.json` (gli hook). Resta fuori `.claude/settings.local.json`, per le scelte personali di chi clona (permessi, override del modello).

| Agente | Quando |
|---|---|
| `architetto` | pianificare una modifica che tocca più livelli o rischia una delle trappole qui sotto; restituisce un piano, non codice |
| `backend-python` | implementare sul server (`server/*.py`, `server/auth/`, `server/routers/`) |
| `frontend-react` | implementare sulla UI (`frontend/src`, Electron, Capacitor) |
| `revisore` | rilettura prima del commit, sola lettura |
| `collaudo-api` | provare che funzioni: prima il problema segnalato, poi tutto `DOCS/COLLAUDO.md` |

**Slash command** (`.claude/commands/`, versionati):

| Comando | Cosa fa |
|---|---|
| `/commit-ready` | controlla che le modifiche pendenti siano pronte: rebuild `dist/`, `norm_check`, porta 8090 allineata, tre modifiche per una pagina nuova, `crea_ydl`, `COLLAUDO.md` aggiornato. Non committa. |
| `/nuova-pagina <Nome> [/url]` | promemoria e passi per le tre modifiche coerenti di una pagina SPA (`App/routing.js`, `App/AppRoutes.jsx`, `spa_routes()`). |
| `/collaudo [problema]` | invoca il subagent `collaudo-api` sul problema indicato (o dedotto dal diff), poi su `DOCS/COLLAUDO.md`. |

**MCP** (`.mcp.json` in radice, versionato): un solo server, `playwright` (`@playwright/mcp`, pin `0.0.80`, headless + profilo isolato), per i controlli di UI che `curl` non copre — seek e barra del player, fullscreen, tema, `data-theme` su `<html>`. Al primo avvio Claude Code chiede di fidarsi del server; il binario del browser va installato una volta (`npx playwright install chrome`). L'agente `collaudo-api` resta volutamente su `curl`/API: i controlli col browser si fanno dalla sessione principale. Per aggiornare il pin: cambia la versione in `.mcp.json` dopo aver verificato `npx -y @playwright/mcp@<nuova> --version`.

`frontend/dist/` **è versionato** (il server lo serve così com'è): dopo aver toccato il frontend serve `npm run build` e i file buildati vanno committati. `frontend/node_modules/` e i file personali in `data/` sono invece ignorati.

**Hook** (`.claude/settings.json`, ora versionato):

- `Stop` / `SubagentStop` → `scripts/rebuild_frontend.sh` (versionato): ricostruisce `dist/` se e solo se i sorgenti sotto `frontend/` sono più recenti del build — no-op veloce altrimenti, silenzioso se Node non c'è. Non fa mai commit: `git add frontend/dist` resta manuale. Così `dist/` non resta mai indietro rispetto ai `.jsx`.
- `PostToolUse` (Edit/Write/MultiEdit) → `scripts/norm_check_hook.py` (versionato): dopo ogni scrittura lancia `norm_check.py` sul **solo** file toccato, se è un `.py`/`.js`/`.jsx` sotto `server/`, `frontend/src/`, `electron/` o `scripts/`. Se ci sono violazioni della regola "stile 42" le rimette nel contesto (exit 2); non annulla la modifica né blocca — è un promemoria, come il rebuild.

Chi clona il repo eredita gli hook così come sono. Chi non usa Claude Code lancia `rebuild_frontend.sh` / `norm_check.py` a mano (o il solito `npm run build`).

## Architettura

Un unico processo FastAPI fa sia API sia hosting dei file statici. Non esiste database: tutto lo stato sta in file JSON dentro `data/`.

- `server/main.py` — crea l'app FastAPI, registra la guardia sulle scritture e CORS, include i router di `server/routers/`, monta `frontend/dist` su `/`. Solo cablaggio: nessuna logica propria (vedi la regola delle 5 funzioni per file sopra).
- `server/routers/` — un modulo `APIRouter` per dominio (ricerca, streaming/mux, commenti, OAuth, iscrizioni, feed, cookie, cronologia, preferenze, route SPA...). Ognuno sotto le 5 funzioni per file; la mappa completa dei moduli è nel docstring di `server/routers/__init__.py`.
- `server/auth/` — un modulo per dominio (cookie, OAuth, commenti, iscrizioni, feed pigri, cronologia, preferenze, loghi canale...), sostituto del vecchio singleton `AuthManager` da 66 metodi. Lo stato in memoria non è più un oggetto con un metodo per operazione: è il dataclass `AuthState` in `server/auth/state.py`, un singleton (`state`, caricato all'import) passato come **primo argomento esplicito** ad ogni funzione degli altri moduli — es. `subscriptions_sync.get_subscriptions(state)` al posto di `auth_manager.get_subscriptions()`. Il caricamento/salvataggio JSON (scrittura su temporaneo + `os.replace`, lettura che tollera un file rotto spostandolo in `.corrotto`) sta in `server/auth/storage.py`: serve perché `state` è costruito all'import, quindi con `write_text` diretta e `json.loads` nudo un kill a metà salvataggio impediva l'avvio del server. Mappa completa nel docstring di `server/auth/__init__.py`.
- `server/sync/` (`scheduler.py` + `runner.py`) — `scheduler` (singleton): loop orario che rinnova le iscrizioni via API e ricostruisce la cache del feed iscrizioni. Avviato da `server/core/startup.py` (`on_startup`). La logica di un ciclo è in `runner.py` perché insieme ai metodi di `SyncScheduler` avrebbe superato le 5 funzioni per file.
- `server/ytdlp/patch.py` — correzioni all'estrattore di yt-dlp, applicate all'avvio da `main.py`. Oggi una sola: l'id del canale nelle card dei video in collaborazione, che yt-dlp non trova (vedi il docstring). Ogni patch agisce solo se il dato manca, così non fa danni quando yt-dlp si aggiorna.
- `server/core/` (`security.py`, `config.py`, `startup.py`) e `server/ytdlp/` (`helpers.py`, `format_selectors.py`, `patch.py`) — moduli di supporto condivisi dai router: guardia sulle scritture esterne, porta del server, avvio, opzioni base di yt-dlp ed esecuzione fuori dall'event loop, selettori di formato, patch dell'estrattore.

**yt-dlp è l'unica fonte dei dati YouTube** (niente API key per ricerca/video/commenti/sottotitoli). La YouTube Data API v3 serve solo per le iscrizioni (elenco, iscriversi, disiscriversi) e i loghi dei canali, e richiede l'OAuth.

### Riproduzione: due selettori di formato, due scopi

`adaptive_format_selector` e `cast_format_selector` (`server/ytdlp/format_selectors.py`) non sono intercambiabili — i docstring spiegano il perché (Chromecast che non decodifica AV1/Opus). Il player reale usa **`/api/mux`** (`server/routers/streaming.py`): ffmpeg unisce al volo video+audio adattivi in un MP4 frammentato (`-c copy`, `frag_duration` 1s). Conseguenza da tenere a mente: niente `Content-Length`/Range, quindi il `<video>` da solo non sa cercare oltre il buffer. Il seek si fa con il parametro **`start`**: il player riapre il flusso dal secondo richiesto (ffmpeg `-ss` prima degli input) e mostra `start + currentTime` — vedi `components/VideoPlayer/index.jsx`, che per questo ha una barra e dei controlli propri invece di quelli nativi.

In sola copia un flusso non può partire da metà GOP, e le scorciatoie ovvie sbagliano: `-copypriorss 0` aspetta il keyframe *successivo* — diversi secondi di caricamento su ogni salto in avanti, e vicino alla fine del video, dove un keyframe dopo non esiste, un flusso **senza traccia video** che pianta anche l'audio (era il bug "verso la fine perdo l'audio" + "quando mando avanti rimane a caricare"). Oggi `start` viene passato **grezzo** come `-ss` prima di ogni input: ffmpeg in `-c:v copy` atterra da sé sull'ultimo keyframe ≤ quel valore (primo pacchetto video sempre `K`, verificato). Il player mostra `start + currentTime`, quindi dopo un salto la barra può essere avanti di ≤ 1 GOP (~3s) rispetto al fotogramma — offset fisso, non deriva, come lo snap ai segmenti di YouTube. C'era un `_keyframe_before()` che faceva un `ffprobe` mirato per trovare quel keyframe e passarlo esatto: **rimosso**, costava 4-5s sul percorso critico del salto (su un flusso 4K la range request è lenta) e per giunta un `-ss` esatto sul keyframe rallenta l'avvio di ffmpeg di ~1.7s rispetto a un valore "largo" (misurato). Il salto ora riparte in ~1s come l'apertura di un video nuovo.

Passare lo stesso `-ss` a video e audio **non basta** comunque: con `-c copy` su due input HTTP separati, ognuno col proprio `-ss` e range request, l'MP4 esce con un buco *deterministico* di ~9s senza pacchetti video subito dopo il keyframe (l'audio scorre) e il `<video>` resta a bufferare all'infinito — succede anche con `-ss` esatto sul keyframe, è l'interleaver di ffmpeg che in sola copia non sincronizza i due flussi appena aperti. La cura, **solo sui salti** (`start>0`, ramo MP4), è ricodificare la sola traccia audio: `-c:v copy -c:a aac -b:a 160k` in `_build_ffmpeg_cmd` (AAC = encoder nativo, sempre presente; ~130 kbit/s, costo trascurabile anche su Raspberry). Verificato: 6/6 salti puliti contro 6/6 col buco. `start=0` e `/api/download` restano `-c copy`; il ramo `webm` (Cast 4K) resta in copia (l'AAC non entra in un WebM — da riprovare con un ricevitore reale). `/api/watch` (`server/routers/watch.py`) serve solo ai metadati della pagina video: nessun URL di stream, li risolve `/api/mux` da sé tenendoli in cache per il seek.

**`/api/download` usa lo stesso meccanismo** (ffmpeg in sola copia verso la pipe, helper condiviso `ffmpeg_pipe_response` in `server/routers/ffmpeg_pipe.py`) ma con `Content-Disposition: attachment` e i codec compatibili del Chromecast: un file che si conserva deve aprirsi anche fuori da un browser aggiornato, e il meglio assoluto di YouTube è AV1+Opus. Non scrive niente su disco — la vecchia cache in `/tmp/ytproxy_cache` accumulava video interi per sempre e la si cancella all'avvio (`_pulisci_cache_download` in `server/core/startup.py`).

La stessa mancanza di Range si porta dietro la trappola più insidiosa: **`video.seekable` è vuoto** (Chrome lo espone come `[0,0]`), e su un elemento così ogni `currentTime = x` viene *schiacciato a zero* invece di fallire. Il player aveva una scorciatoia — "se il punto è già in `buffered`, sposta `currentTime` e non riaprire niente" — che quindi non spostava un bel niente: riportava il video all'inizio del flusso mentre la barra mostrava il punto chiesto. Si vedeva su ogni salto corto (barra mossa di poco, tasti ← →, doppio tocco sul telefono), mai su quelli lunghi, che uscendo dal buffer prendevano già la strada della riapertura. Da qui `isSeekable()` accanto a `isBuffered()` in `components/VideoPlayer/index.jsx`, più la rilettura di `currentTime` subito dopo averlo scritto: se il salto non è andato a segno si riapre il flusso. In pratica oggi **ogni** salto riapre il flusso; la scorciatoia resta solo per i browser che dichiarino davvero un intervallo cercabile.

Da lì discende anche una trappola sulla velocità di riproduzione (menu rotellina → "Riproduzione veloce", e il 2x tenendo premuto sul video): siccome ogni salto riapre il flusso con `load()`, e `load()` riporta `playbackRate` a `defaultPlaybackRate`, la velocità va riapplicata dopo ogni riapertura. In `components/VideoPlayer/index.jsx` lo fa un effect che dipende anche da `stream` ed è dichiarato **dopo** quello del caricamento — l'ordine conta, altrimenti scriverebbe la velocità prima di `load()` e verrebbe azzerata subito.

### Due autenticazioni indipendenti, entrambe facoltative

| | A cosa serve | Dove |
|---|---|---|
| `data/cookies.txt` | Feed home reale e feed iscrizioni reale (via yt-dlp) | upload manuale o import automatico dal browser (`/api/cookies/import`, gestisce i percorsi snap su Linux) |
| OAuth Google | Elenco iscrizioni + loghi canale (Data API v3), iscriversi/disiscriversi da un canale, lettura/pubblicazione commenti, «mi piace» a un video | l'utente crea il proprio Client ID di tipo "TV e dispositivi con input limitato"; device flow su `/api/auth/device/*` |

Sui cookie c'è una trappola che vale la pena ricordare: contano solo quelli di **prima parte sul dominio `youtube.com`** (`SID`, `__Secure-1PSID`, `LOGIN_INFO`, `SAPISID`). Essere loggati su `google.com` non basta — un profilo browser loggato su Google ma che non ha mai aperto YouTube produce un `cookies.txt` di decine di cookie in cui YouTube ti vede comunque anonimo, quindi feed vuoti. `youtube_auth_cookies()` in `auth/cookie_session.py` è il controllo che distingue i due casi, e `cookies.get_cookie_status()` lo espone come `logged_in`.

Da quella trappola discende una regola: **yt-dlp si istanzia sempre con `crea_ydl()` (`auth/cookie_session.py`), mai con `yt_dlp.YoutubeDL()`**. `YoutubeDL.close()` chiama sempre `save_cookies()`, quindi ogni estrazione riscrive `cookies.txt` con il jar che ha in memoria — e se YouTube ha appena invalidato la sessione quel jar contiene un logout, che così diventa permanente sul file. `crea_ydl()` mette il controllo sul cookie jar: la rotazione normale dei cookie si salva, la cancellazione della sessione no.

Senza nessuna delle due, ricerca, correlati e riproduzione funzionano lo stesso.

**L'OAuth usa il device flow, e non è un dettaglio estetico.** Il flow web classico ha un redirect URI, e Google per l'`http://` accetta solo `localhost`/`127.0.0.1` — gli IP privati li rifiuta come URI autorizzato. Quindi con il server su un'altra macchina della rete (Raspberry, NAS) il redirect rimanda il browser al `localhost` di *chi sta guardando*, dove non c'è nessun server: la schermata di consenso passa e subito dopo la pagina non carica, sintomo che sembra una caduta di rete. Il device flow (`start_device_flow` / `poll_device_token` in `auth/oauth_flow.py`) non ha redirect: il server chiede un codice, l'utente lo digita su `google.com/device` da un dispositivo qualsiasi, il server intanto fa polling. Funziona identico su localhost, su IP di LAN e in headless. È l'unico flow rimasto: il client OAuth va creato come "TV e dispositivi con input limitato".

Le azioni che *scrivono* su YouTube — pubblicare un commento, iscriversi/disiscriversi da un canale, mettere «mi piace» a un video (`POST /api/videos/<id>/rate`, `server/routers/videos.py` + `auth/video_rating.py`) — richiedono lo scope `youtube` (`WRITE_SCOPE` in `auth/config.py`, esposto come `oauth_status.can_write()` e come `can_comment`/`can_subscribe` in `/api/auth/status`; il frontend riusa `can_comment` come `canRate`). Non `youtube.force-ssl`, che darebbe lo stesso accesso: il device flow ("TV e dispositivi con input limitato") accetta solo un elenco ristretto di scope e da lì `force-ssl` è assente — usarlo fa fallire `/api/auth/device/start` con `Invalid device flow scope` prima ancora della schermata di consenso. Chi si era collegato quando l'app leggeva soltanto ha un refresh token senza quello scope: continua a leggere le iscrizioni ma riceve 403 `insufficientPermissions` finché non rifà il login. Lo stato "sono iscritto a questo canale?" (`/api/subscriptions/status/<id>`) si legge invece dalla copia locale `data/subscriptions.json`, non da YouTube: iscriversi e disiscriversi costano 50 unità di quota ciascuna, aprire una pagina canale non deve costarne nessuna.

### Chi può scrivere: nessun login, ma l'origine conta

Il server ascolta su `0.0.0.0` e non ha autenticazione — è voluto, così lo si apre da telefono e TV senza credenziali. La conseguenza da non sottovalutare è che le API sono raggiungibili anche dal browser di casa mentre sta su un sito qualunque: con `allow_origins=["*"]` quella pagina poteva chiamare `DELETE /api/cookies`, disiscriverti da un canale o pubblicare un commento a nome tuo, e tu non ne vedevi niente.

Da qui la guardia `blocca_scritture_esterne` in `server/core/security.py` (registrata su `app` in `main.py`): **`POST`/`PUT`/`PATCH`/`DELETE` passano solo se l'`Origin` è locale** (same-origin rispetto all'header `Host`, oppure localhost / `10.x` / `192.168.x` / `172.16-31.x` / `*.local`), altrimenti 403. Tre cose che ne discendono:

- Le **GET non sono filtrate**, di proposito: il Chromecast scarica il video da sé e non manda `Origin`, quindi `/api/mux` deve restargli aperto. Una GET da un sito ostile parte ma non riceve header CORS, quindi la risposta non è leggibile.
- **Origin assente = permesso.** Non è una svista: senza browser (curl, l'app nativa) non c'è nessuna sessione da abusare, e la pagina ostile da cui ci si difende è per forza dentro un browser, che l'`Origin` sulle scritture lo manda sempre.
- Un endpoint di scrittura nuovo è protetto **senza fare niente**: la guardia è un middleware, non un decoratore da ricordarsi. Chi invece raggiunge il server da un indirizzo non privato (Tailscale `100.64.x`, un dominio dietro reverse proxy) e *non* in same-origin deve elencarlo in `YTPROXY_ALLOWED_ORIGINS` (separati da virgola), altrimenti le scritture gli tornano 403 mentre la lettura funziona — sintomo che sembra un bug del frontend.

I file con dentro credenziali (`data/oauth_token.json`, `oauth_setup.json`, `cookies.txt`) si scrivono con `scrivi_privato()` di `auth/storage.py`, che li lascia a `0600`: `write_text()` su un file già esistente non ne cambia i permessi, quindi il chmod va rifatto ad ogni scrittura, e `proteggi_file_riservati()` all'avvio (chiamata da `server/core/startup.py`) sistema quelli creati dalle versioni precedenti. Per `cookies.txt` il punto di passaggio è dentro `crea_ydl()`, perché a riscriverlo è yt-dlp ad ogni estrazione, non solo l'upload.

### Fallback dei feed (catena voluta, non accidentale)

- Home: **solo** `/api/feed/home` (cookie, `LazyFeed`, `auth/feed_home.py`). Nessun fallback: se il feed è vuoto l'endpoint restituisce `reason` (`no-cookies` / `not-logged-in` / `feed-vuoto`) e la home lo spiega, invece di mostrare dei trending fingendo che sia la tua home. YouTube però chiude le continuazioni della home presto (misurato: ~200-350 video, non il tetto `FEED_MAX`), quindi quando il generatore finisce il feed viene **riaperto** daccapo: una nuova estrazione dà una lista in buona parte diversa (~100 video mai visti su ~280) e gli id già serviti vengono saltati. Vedi `LazyFeed._rigenera` (`auth/lazy_feed.py`), `FEED_REFILL_MAX` (`auth/config.py`); vale solo per la home, perché riaprire un canale o un Mix ridarebbe la stessa lista.
- Correlati: `/api/related/<id>` (`auth/feed_related.py`) legge il "Mix" di YouTube (playlist `RD<id>`) con lo stesso `LazyFeed` — si estende con continuazioni quasi senza fine, quindi regge lo scroll infinito della sidebar. YouTube però il Mix non lo genera per i video poco visti o dei canali piccoli (yt-dlp avvisa `Unable to recognize playlist`): in quel caso si ripiega su una ricerca per titolo del video, e la risposta lo dichiara in `source` (`mix` / `ricerca` / `nessuna`).
- Iscrizioni: feed cookie di YouTube (cache 5 min) → cache su disco aggiornata ogni ora da `sync/scheduler.py`/`sync/runner.py` → fetch a caldo ridotto (15 canali) se la cache è ancora vuota (`auth/feed_subscriptions.py`). Le due metà della pagina Iscrizioni hanno autenticazioni diverse e ognuna funziona da sola — l'elenco dei canali viene dall'OAuth, il feed dai cookie — quindi `SubscriptionsPage` si dichiara vuota solo se mancano entrambe, e la scheda "Canali" c'è solo con l'OAuth.
- `subscriptions_sync.sync_subscriptions` (`auth/subscriptions_sync.py`) sostituisce `subscriptions.json` **solo** se la scansione arriva all'ultima pagina: una lista parziale (quota finita, token revocato a metà) non è meglio di niente, cancellerebbe i canali delle pagine mancanti.
- Canale: `/api/channel/<id>/videos` (`auth/feed_channel.py`) pagina la scheda "Video" con lo stesso `LazyFeed` e restituisce in `channel` anche l'intestazione (nome, logo, copertina, iscritti), che arriva gratis dalla stessa estrazione. Le voci di quella scheda non ripetono l'autore, quindi il nome canale viene riempito dai metadati della lista.

`LazyFeed` (`auth/lazy_feed.py`) tiene vivo il generatore di yt-dlp tra una richiesta e l'altra per scaricare il feed a blocchi mentre l'utente scorre. È bloccante e non thread-safe: gli accessi passano da un lock per feed (`state.feed_locks`, uno per chiave — `home`, `related:<id>`, `channel:<id>`) e girano in `run_in_executor`. La paginazione condivisa (apertura, estensione, cache LRU dei feed aperti) sta in `auth/feed_pager.py` e `auth/feed_cache.py`: i parametri di una pagina, che erano più di 5 argomenti posizionali, sono raggruppati nel dataclass `FeedPageRequest`. I feed aperti stanno in una cache LRU (`state.feeds`, max `MAX_OPEN_FEEDS`) perché ognuno tiene viva un'istanza di yt-dlp. Chiama `save_cookies()` ad ogni blocco perché YouTube ruota i cookie di sessione e non farlo invalida la sessione.

### Frontend

React 18 + Vite, senza router né librerie di stato. `App/` (pacchetto, non più un `App.jsx` unico) implementa il routing a mano sulla History API. **Aggiungere una pagina richiede tre modifiche coerenti**: `pageToUrl`/`urlToPage` in `App/routing.js`, il rendering condizionale in `App/AppRoutes.jsx`, e la route corrispondente in `spa_routes()` di `server/routers/spa.py` (senza quest'ultima, aprire l'URL diretto o ricaricare dà 404).

Le preferenze salvate sul server stanno nel context `usePrefs` (`hooks/usePrefs.jsx`), non nei singoli componenti: da lì le legge il player (qualità predefinita, autoplay) e il tema, che diventa l'attributo `data-theme` su `<html>` (palette chiara e scura in `App.css`; il player resta scuro in entrambi i temi, come su YouTube, perché i suoi comandi stanno sopra il video). Una scelta fatta a mano dal menu del player ha la precedenza sulla preferenza fino a fine sessione — vedi `qualitaScelta` in `pages/VideoPage/useVideoQuality.js`. La preferenza autoplay decide solo se un video *appena aperto* parte da solo: le riaperture del flusso dovute a un salto o a un cambio di qualità ripristinano lo stato di prima, altrimenti spostare la barra di un video in pausa lo farebbe ripartire (`andavaRef` in `components/VideoPlayer/index.jsx`).

`api/` (pacchetto: `base.js`, `core.js`, `device.js`, `endpoints/*.js`, riesportati da `index.js`) centralizza le chiamate e il rilevamento del dispositivo. `getServerBase()` è vuoto sul web/Electron (stessa origine) ma su Android/Capacitor legge da localStorage l'indirizzo impostato in `ServerSetup`; `getLanBase()` serve al Chromecast, che scarica il video da sé e quindi ha bisogno di un URL assoluto e non-localhost.

Sull'APK c'è una trappola legata a quell'indirizzo: `capacitor.config.json` deve tenere `server.androidScheme: "http"`. Di default Capacitor serve la WebView su `https://localhost`, e da un'origine https ogni chiamata a `http://<ip-del-pc>:8090` è **contenuto misto**, che la WebView blocca in silenzio (`allowMixedContent` è `false` di default: `Bridge.initWebView()` chiama `setMixedContentMode(ALWAYS_ALLOW)` solo se attivo). Il sintomo è inconfondibile — dal browser del telefono il server si apre, dall'app no, e l'onboarding dice "non raggiungibile" anche con l'IP giusto. Non basta `usesCleartextTraffic="true"` nel manifest: quello autorizza l'HTTP in chiaro, non lo sblocca da un'origine sicura. Nota che cambiare schema cambia l'origine, quindi chi aggiorna l'APK perde l'indirizzo salvato in localStorage e deve reinserirlo una volta.

Seconda trappola dell'APK, sullo schermo intero: `BridgeWebChromeClient` di Capacitor ridefinisce `onShowCustomView` ma dentro chiama subito `onCustomViewHidden()`, cioè annulla la richiesta di schermo intero della pagina. Le due ridefinizioni gli servono solo perché Android, via reflection, concede lo schermo intero alla WebView unicamente se il client dichiara di gestirlo. Risultato: il video si allargava dentro la finestra dell'app ma barra di stato e barra di navigazione restavano lì sopra. `FullscreenWebChromeClient` (in `android/.../com/ytproxy/app/`) estende quella classe, attacca davvero la vista che la WebView passa e nasconde le barre finché lo schermo intero dura; `MainActivity` lo installa in `onCreate` — non più tardi, perché il costruttore di Capacitor registra dei launcher di activity result, vietati a activity già avviata.

Terza trappola dell'APK: il telefono e la Smart TV stanno spesso su una **rete solo-LAN, senza DNS pubblico** (router che non inoltra, Wi-Fi ospiti, hotspot). La WebView non risolve `fonts.googleapis.com`, `i.ytimg.com`, `yt3.ggpht.com` — ma il server sì (lo usa per yt-dlp), quindi ricerca, video, commenti e feed funzionano lo stesso. A cadere è solo ciò che il browser caricava **diretto dal web pubblico**: (1) i font — Roboto e Material Symbols erano un `@import` da Google, e senza le icone restavano scritte come testo (`menu`, `play_circle`, `pause`…) e la barra dei comandi del player sbordava; ora sono impacchettati nel bundle (`frontend/src/assets/fonts/*.woff2`, `@font-face` locale in `App.css`). (2) le miniature e i loghi canale — ora passano tutti dal proxy del server **`GET /api/img?u=<url>`** (`server/routers/images.py`, elenco chiuso di host YouTube), e il frontend avvolge ogni `<img src>` di YouTube con **`proxyImg()`** (`api/img.js`). Da quelle miniature è stato tolto `loading="lazy"`: nella WebView le immagini lazy non partono finché lo schermo non è acceso e composto (verificato via DevTools: `fetch()` dell'URL funzionava, l'`<img loading=lazy>` in viewport restava `pending`), e ormai arrivano comunque da un proxy locale veloce.

Quarta trappola dell'APK, sul Cast nativo: da **Android 13** (`targetSdk` è 36) il Cast SDK non scopre **nessun** dispositivo via mDNS finché l'app non ha il permesso **runtime** `NEARBY_WIFI_DEVICES` — dichiararlo nel manifest non basta, va anche *chiesto* a mano. `CastBridgePlugin.showDevicePicker()` lo chiede al primo tocco su "Trasmetti" (`@Permission(alias="nearbyWifi")` + `requestPermissionForAlias`, callback che riapre comunque il selettore). Manifest: aggiunti `NEARBY_WIFI_DEVICES` (`neverForLocation`), `CHANGE_WIFI_MULTICAST_STATE` (ricezione dei pacchetti mDNS) e `ACCESS_FINE_LOCATION` con `maxSdkVersion=32` (ripiego pre-13, senza far chiedere la posizione su 13+). Nota a parte: **le Smart TV senza Chromecast integrato** (Samsung, LG, Roku, Fire TV) non compaiono comunque nel selettore — non parlano il protocollo Google Cast; l'app YouTube ufficiale ci arriva con DIAL + il "lounge" di YouTube, non con Cast.

Il Cast lato **web** (`hooks/useCast.jsx`) funziona solo su Chrome/Edge/Brave desktop — non in Electron, non in Chromium open-source — e l'hook espone il motivo dell'indisponibilità per poterlo spiegare all'utente. L'unico comando è `CastButton` nella pagina video: sempre visibile, spiega il motivo invece di sparire quando il cast non è disponibile.

## Docker

I file Docker stanno in `docker/` (`Dockerfile`, `docker-compose.yml`, `docker-entrypoint.sh`); si lanciano dalla radice del repo con `make` (target in `Makefile`, wrapper su `docker compose -f docker/docker-compose.yml`) oppure passando `-f docker/docker-compose.yml` a mano. Il contesto di build resta comunque la radice del repo (`context: ..` in `docker-compose.yml`), non `docker/`: `Dockerfile` fa `COPY server/` e `COPY frontend/dist/` relativi a quella radice. Il nome di progetto è fissato a `ytproxy` (`name:` in `docker-compose.yml`) apposta, perché altrimenti Compose lo deriverebbe dalla cartella del file (`docker`, non più il nome del repo) e romperebbe un container già avviato con il vecchio layout.

`Dockerfile` impacchetta server Python + `frontend/dist` (già buildato e versionato: l'immagine non installa Node e non lo builda). Nessuna modifica al codice applicativo — `DATA_DIR` (`auth/storage.py`) e `SERVER_PORT` (`server/core/config.py`) leggono già `YTPROXY_DATA`/`YTPROXY_PORT` dall'ambiente, il Dockerfile si limita a impostarle.

- `docker-entrypoint.sh` fa all'avvio del container quello che `scripts/start_server.sh` faceva una volta al giorno sull'host: `pip install --upgrade yt-dlp`, non bloccante (continua con la versione dell'immagine se manca la rete). Disattivabile con `YTPROXY_SKIP_YTDLP_UPDATE=1`.
- `docker-compose.yml` monta `../data:/data` (percorso relativo alla radice del repo, non al file stesso — vedi sopra) — bind mount, non volume nominato, così cookie/token OAuth/iscrizioni sono file veri sul disco dell'host, ispezionabili e sopravvivono a `docker compose down` e ai rebuild.
- Rete: bridge + `-p 8090:8090` (non serve `network_mode: host`). L'unico effetto collaterale è che `/api/lan-address` — usato dal Cast solo come fallback quando il browser è aperto su `localhost` — risponde con l'IP interno del container (`172.17.x.x`) invece di quello LAN. Non un problema quando il server gira su una macchina headless tipo il Raspberry Pi ([[server-su-raspberry-pi]]): lì non si apre mai `localhost:8090` in un browser, telefono e TV colpiscono l'IP LAN direttamente e `isCastableOrigin()` prende quella strada senza mai chiamare `/api/lan-address`. Se invece si apre il Cast da un browser sulla stessa macchina del server (desktop), serve `network_mode: host` in compose.
- Chi tocca il frontend continua a fare `npm run build` + commit di `dist/` come da regola sopra; in più, con Docker, va rifatto anche `make build` (o `make up`) per far entrare il nuovo `dist/` nell'immagine (prima bastava che uvicorn --reload rivedesse i file su disco).
- `.dockerignore` esclude sempre `data/`: anche se il `Dockerfile` non fa mai `COPY . .`, un futuro cambiamento che lo introducesse non finirebbe comunque per infornare cookie/token OAuth in un layer dell'immagine. Resta nella radice del repo (non in `docker/`) perché Docker lo cerca sempre nella cartella di contesto, non accanto al Dockerfile.

## Nota sulla porta 8090

È ripetuta in più punti che devono restare allineati: `SERVER_PORT` in `server/core/config.py` (override con `YTPROXY_PORT`), il proxy in `frontend/vite.config.js`, `electron/main.js`, `scripts/start_server.sh`/`.bat`, `docker/Dockerfile` (`EXPOSE`) e `docker/docker-compose.yml` (`ports`). Su Google Cloud Console invece non va registrata: col device flow non c'è nessun redirect URI.
