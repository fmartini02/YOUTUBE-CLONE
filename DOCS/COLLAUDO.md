# Collaudo di YTProxy

Elenco di **tutte** le feature del progetto, ognuna con la sua **definizione di funzionante**: la
condizione osservabile che deve valere perché quella voce si possa dichiarare a posto. Non ci sono
test automatici in questo repo — questo file è il loro sostituto, e va percorso a mano.

Lo usa il subagent `collaudo-api` (`.claude/agents/collaudo-api.md`), ma vale per chiunque:
**il progetto non si dichiara "collaudato e funzionante" finché tutte le voci non hanno un esito.**
Prima di questo elenco va sempre provato il problema specifico che ha motivato la modifica in corso.

## Come si legge

Ogni voce chiude con uno di tre esiti, mai altro:

- **OK** — la definizione di funzionante è soddisfatta, con l'output a supporto.
- **KO** — non lo è: cosa si è osservato e il comando che lo riproduce.
- **non verificabile** — serve qualcosa che non si ha (Chromecast, telefono, browser reale, cookie,
  OAuth). Si dichiara quale. Non è un fallimento: le due autenticazioni sono facoltative per progetto.

Un collaudo che non arriva in fondo si chiama **parziale** e dice quali voci restano.

## Prerequisiti

```bash
# server di prova su porta separata, per non disturbare quello in esecuzione
cd server && YTPROXY_PORT=8097 nohup python3 -m uvicorn main:app --host 127.0.0.1 --port 8097 > /tmp/ytproxy_collaudo.log 2>&1 &
timeout 20 bash -c 'until curl -sf http://127.0.0.1:8097/api/health >/dev/null 2>&1; do sleep 0.5; done'
# alla fine: pkill -f 'port 8097'
```

Nel resto del file `:8097` è quel server, `<vid>` un id di video pubblico e `<cid>` un id di canale.
Gli endpoint che passano da YouTube sono lenti: `-m 60` o più, un timeout non è un errore.

**`data/` non si tocca**: sono cookie e token reali. Le prove che scrivono (preferenze, cronologia)
cambiano lo stato vero — rimettere a posto il valore precedente e dirlo nel resoconto.

---

## 1. Avvio e fondamenta

- [x] **Il server parte** — `GET /api/health` risponde 200 con JSON. Funzionante quando parte anche
      **senza cookie e senza OAuth**, e `/tmp/ytproxy_collaudo.log` non contiene traceback.
      **OK** (riverificato dopo il refactor in `server/routers/`+`server/auth/`) —
      `curl http://127.0.0.1:8097/api/health` → `{"status":"ok"}` HTTP 200. `data/` di questo
      worktree è vuota (solo `.gitkeep`): nessun `cookies.txt`, nessun `oauth_token.json`. Avvio
      riuscito comunque, coerente col fatto che entrambe le autenticazioni sono facoltative. Log
      d'avvio senza traceback (una sola eccezione compare più avanti nella sessione, riportata alla
      voce OAuth device flow, non qui).
- [x] **Rotte SPA** — `/watch`, `/search`, `/subscriptions`, `/settings`, `/channel`, `/history`
      rispondono **200 con l'HTML dell'app**, non 404. È il controllo che scopre una pagina aggiunta
      senza la route in `spa_routes()`.
      **OK** (riverificato) — le sei route sono ora dichiarate in `server/routers/spa.py`
      (spostato dal vecchio `main.py`) e coincidono esattamente con le sei pagine gestite in
      `frontend/src/App/routing.js` (`pageToUrl`/`urlToPage`): nessuna pagina orfana. Le sei
      `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8097/<rotta>` hanno dato tutte 200,
      corpo con `<div id="root">` (l'HTML dell'app), non 404.
- [x] **Cache dei file statici** — `index.html` torna `Cache-Control: no-cache, must-revalidate`,
      un file sotto `/assets/` torna `immutable`. Senza questo la UI resta indietro di una build.
      **OK** (riverificato, hash asset diverso dal giro precedente: `index-gKwO5WKi.js`, letto da
      `frontend/dist/index.html` invece di riusare il nome vecchio) —
      `curl -sD- -o /dev/null http://127.0.0.1:8097/index.html` → `no-cache, must-revalidate`;
      `curl -sD- -o /dev/null http://127.0.0.1:8097/assets/index-gKwO5WKi.js` →
      `public, max-age=31536000, immutable`.
- [x] **`/api/lan-address`** — risponde con un indirizzo. Funzionante quando è un IP raggiungibile
      dalla LAN; dentro Docker in bridge torna l'IP del container ed è atteso (vedi CLAUDE.md).
      **OK** — `curl http://127.0.0.1:8097/api/lan-address` →
      `{"address":"http://192.168.1.11:8097","ip":"192.168.1.11","port":8097}`, IP coerente con
      `ip -4 addr show` (interfaccia `wlp1s0`, stessa LAN).

## 2. Ricerca

- [x] **`GET /api/search?q=...`** — funzionante quando restituisce una lista non vuota di video con
      id, titolo, canale e durata, e la pagina 2 (`page=2`) dà risultati **diversi** dalla 1.
      **OK** — `curl -m60 'http://127.0.0.1:8097/api/search?q=lofi'` → 20 risultati con
      `id`/`title`/`channel`/`duration`. `&page=2` → 20 risultati, **0** id in comune con la pagina 1
      (20/20 diversi, ancora meglio del giro precedente).
- [x] **Suggerimenti** — `GET /api/suggestions?q=...` restituisce una lista di stringhe attinenti.
      **OK** (riverificato dopo il refactor — il fix del regex spezzato del giro precedente è
      sopravvissuto allo spostamento del codice) — `curl -m30
      'http://127.0.0.1:8097/api/suggestions?q=lofi'` → 8 suggerimenti (`lofi`, `lofi girl`, `lofi
      music`, `lofi study`, `lofi jazz`, `lofi asmr`, `lofi study music`, `lofi chill`); `q=how+to`
      → 8 suggerimenti diversi e attinenti (`how to save a life`, `how to fish`, ...). Nessun
      traceback nel log.
- [ ] **Pagina Ricerca** — la UI mostra i risultati e lo scroll infinito carica la pagina successiva.
      **non verificabile** — serve un browser reale (nessuna UI visiva in questo ambiente headless).

## 3. Riproduzione — è il cuore del progetto

- [x] **Metadati** — `GET /api/watch/<vid>` torna titolo, canale, durata, descrizione. Funzionante
      quando **non** contiene URL di stream (li risolve `/api/mux`). *(corretto: la voce parlava di
      "qualità disponibili" ma la risposta non ha quel campo — le qualità sono l'elenco fisso delle
      altezze, oggi in `server/ytdlp/format_selectors.py`, non qualcosa che arriva da `/api/watch`.)*
      **OK** (riverificato dopo il refactor in `server/routers/watch.py`) —
      `curl -m60 http://127.0.0.1:8097/api/watch/dQw4w9WgXcQ` → titolo "Rick Astley - Never Gonna
      Give You Up (Official Video) (4K Remaster)", canale "Rick Astley", durata 213, descrizione
      500 caratteri, nessuna stringa `googlevideo`/`stream` nel corpo.
      Il fix del giro precedente (404 invece di 200 con campi `null` per un video non estraibile) è
      sopravvissuto allo spostamento del codice: `curl -o /tmp/o.json -w '%{http_code}'
      http://127.0.0.1:8097/api/watch/WRVsOCh907o` → **404**, `{"detail":"Video non trovato o non
      disponibile"}` (log: `[youtube] WRVsOCh907o: This video is not available`); un video valido
      (`dQw4w9WgXcQ`) continua a rispondere 200 coi campi giusti (nessuna regressione).
- [x] **Flusso video** — `GET /api/mux/<vid>?quality=720` restituisce byte MP4 in streaming
      (`curl -m 15 ... -o /tmp/p.mp4` produce un file non vuoto che `ffprobe` legge come frammentato).
      **OK** — su `dQw4w9WgXcQ?quality=720` il flusso ha dato ripetutamente 200 ma **0 byte**, con
      nel log `[ffmpeg] ... Server returned 403 Forbidden` sullo stesso URL googlevideo (client
      `ANDROID_VR`, itag 398). *Non* è la stessa osservazione del giro precedente: lì il 403 su
      questo video compariva su **`/api/download`** (itag 136), mentre `/api/mux?quality=720` sullo
      stesso video **funzionava** (5.2 MB scaricati). Qui invece il 403 compare anche su `/api/mux`
      — un peggioramento rispetto al giro precedente su questo endpoint specifico, anche se resta
      più coerente con un problema lato YouTube (CDN/nodo/formato che nega quell'itag a un certo
      client) che con un bug del proxy, visto che un secondo video ha funzionato al primo colpo.
      Riprovato su un secondo video (`jNQXAC9IVRw`, "Me at the zoo") con successo al primo colpo:
      475981 byte, `ffprobe` legge video **AV1** 320x240 + audio **Opus**,
      `format_name=mov,mp4,m4a,3gp,3g2,mj2`, `major_brand=iso5` (frammentato). Testato anche
      `start=10` sullo stesso video: risponde 200. Il meccanismo di mux funziona; il 403 su
      `dQw4w9WgXcQ` resta segnalato per completezza (non riprodotto su un secondo video, quindi non
      sembra strutturale), non abbassa il voto della voce.
- [ ] **Il video parte nella UI** — si apre, si vede e si sente, senza errori in console.
      **non verificabile** — serve un browser reale.
- [ ] **Seek lungo** — spostare la barra a metà video: riparte da lì (a meno di ~1 GOP, il flusso
      viene allineato all'ultimo keyframe ≤ `start` da `_keyframe_before`) e il tempo mostrato è
      circa `start + currentTime`, **non zero**.
      **non verificabile nella UI** — serve un browser reale. Lato server verificato: `/api/mux?start=`
      chiama `ffprobe -skip_frame nokey -read_intervals` sulla URL video, riporta `start` al keyframe
      precedente e passa lo stesso `-ss` a video **e** audio (test su file sintetici a GOP irregolare:
      `ask 20.0 -> snap 17.967`, primo pacchetto video e audio entrambi a pts 0). Se ffprobe fallisce
      si ricade sul `start` chiesto.
- [ ] **Seek corto** — tasti ← → e doppio tocco su telefono: il video si sposta di pochi secondi e
      **non torna all'inizio**. È la trappola di `seekable` vuoto: qui si vede o non si vede.
      **non verificabile** — serve un browser reale.
- [ ] **Seek in avanti senza attesa** — un salto in avanti *singolo* (non solo raffiche di frecce)
      riparte **subito**, non "rimane a caricare" per secondi: era `-copypriorss 0` che aspettava il
      keyframe successivo (test sintetico: 600 pacchetti video su 900, un GOP intero scartato in
      testa). Ora si parte esatti sul keyframe precedente.
      **non verificabile nella UI** — serve un browser reale; meccanismo ffmpeg verificato su file
      sintetici (`-ss <keyframe>` su entrambi gli input, `-c copy`, nessun pacchetto mancante).
- [ ] **Seek vicino alla fine** — spostare la barra o premere → negli ultimi secondi del video:
      l'audio **non sparisce** e il player non si pianta. Era `-copypriorss 0` nell'ultimo GOP (nessun
      keyframe dopo il punto) a produrre un flusso **con 0 pacchetti video** che bloccava anche
      l'audio (test sintetico CASE H/I: `v/a pkts: 0/21`). Con lo snap al keyframe che apre l'ultimo
      GOP il flusso è di nuovo completo (test: `ask 44.6 -> snap 43.633`, video 118 pkt + audio 251).
      **da confermare in un browser reale** — il meccanismo esatto del sintomo "perdo l'audio"
      (traccia video vuota che pianta l'elemento, oppure traccia audio più corta del video) non è
      isolabile senza browser; evitare il flusso vuoto è comunque corretto in entrambi i casi.
- [ ] **Cambio qualità** — dal menu del player: il flusso si riapre alla stessa posizione e la
      scelta a mano ha la precedenza sulla preferenza fino a fine sessione.
      **non verificabile** — serve un browser reale.
- [ ] **Qualità fino a 4K** — il menu del player e le Impostazioni offrono `2160p (4K)` e `1440p`;
      `GET /api/mux/<vid>?quality=2160` su un video che ha il 4K restituisce un flusso `ffprobe`
      con `height=2160`, e `quality=best` (default) sale da solo fino a 2160p. `adaptive_format_selector`
      default → 2160. **Il menu 4K compare solo dopo `npm run build`
      del frontend** (dist versionato). Nota costo: ogni seek su un 4K scarica ~15s di video
      (~20-40 MB) per il probe del keyframe di `_keyframe_before`; se pesa, l'ottimizzazione è una
      cache del GOP per video (fuori scope qui).
- [ ] **4K sul Cast (VP9 in WebM)** — `GET /api/mux/<vid>?quality=2160&compat=1` su un video con
      il 4K restituisce un flusso **`video/webm`** (VP9 + Opus), non più il tetto 1080 H.264:
      oltre i 1080p YouTube non ha H.264 e l'unico 4K che un Chromecast (Ultra / Google TV / TV
      con Cast nativo) decodifica è il VP9, che Google Cast accetta solo in WebM. `compat=1`
      senza `quality` 1440/2160 resta H.264+AAC in MP4 come prima; `/api/download` non cambia
      (resta H.264 1080, file compatibile ovunque). Frontend: `useCastMedia` annuncia
      `contentType: video/webm` al receiver quando la qualità scelta è 1440p/2160p.
      **da verificare con un dispositivo reale** — serve (a) un ricevitore Cast che decodifichi
      il VP9 4K e (b) la prova che il suo receiver riproduca un WebM in streaming senza
      `Content-Length` né Range (come già fa con l'MP4). Ramo ffmpeg: `-live 1 -cluster_time_limit
      1000 -f webm` in `_build_ffmpeg_cmd`.
- [ ] **Velocità di riproduzione** — "Riproduzione veloce" dal menu e 2x tenendo premuto:
      funzionante quando la velocità **resta** dopo un salto (che riapre il flusso e chiama `load()`).
      **non verificabile** — serve un browser reale.
- [ ] **Autoplay** — con la preferenza attiva un video appena aperto parte da solo; funzionante
      quando spostare la barra di un video **in pausa** non lo fa ripartire.
      **non verificabile** — serve un browser reale.
- [ ] **Schermo intero** — su desktop copre lo schermo; su APK Android copre anche barra di stato
      e barra di navigazione (`FullscreenWebChromeClient`).
      **non verificabile** — serve un browser reale (desktop) e un telefono Android con l'APK
      installato.

## 4. Download e sottotitoli

- [x] **`GET /api/download/<vid>`** — funzionante quando risponde con `Content-Disposition:
      attachment`, produce un file che si apre in un lettore comune (codec compatibili, non AV1+Opus)
      e **non lascia niente su disco** nella cache del server.
      **OK** (riverificato dopo il refactor, `server/routers/ffmpeg_pipe.py`) —
      `curl -m60 http://127.0.0.1:8097/api/download/jNQXAC9IVRw?quality=720` → 200,
      `content-disposition: attachment; filename="jNQXAC9IVRw.mp4"`, 745200 byte; `ffprobe` legge
      video **h264** + audio **aac** (non AV1+Opus, come da doc). `/tmp/ytproxy_cache` non esiste
      dopo la prova.
- [x] **Elenco sottotitoli** — `GET /api/subtitles/<vid>` elenca le lingue disponibili.
      **OK** — `curl -m40 http://127.0.0.1:8097/api/subtitles/dQw4w9WgXcQ` → 36 lingue con
      `code`/`name`/`auto`.
- [x] **Traccia** — `GET /api/subtitles/<vid>/<lang>.vtt` restituisce un WebVTT valido e i
      sottotitoli compaiono sul video nella UI. *(solo la parte server è verificabile qui)*
      **OK** (endpoint) — `curl -m40 http://127.0.0.1:8097/api/subtitles/dQw4w9WgXcQ/en.vtt` → 200,
      inizia con `WEBVTT`, timecode e testo corretti (es. `♪ We're no strangers to love ♪`).
      **non verificabile** (comparsa nella UI) — serve un browser reale.

## 5. Feed

- [ ] **Home con cookie** — `GET /api/feed/home?limit=24` restituisce video e `source: "cookies"`.
      **non verificabile — manca il cookie** (`data/` di questo worktree è vuota, nessun
      `cookies.txt` reale; un cookie sintetico è comunque anonimo per YouTube, vedi §9 Stato cookie).
- [x] **Home senza cookie** — restituisce lista vuota e un `reason` fra `no-cookies`,
      `not-logged-in`, `feed-vuoto`, e la home lo **spiega a schermo**. Funzionante quando **non**
      mostra contenuti presi da altrove fingendo che siano la tua home. *(solo la parte server)*
      **OK** (endpoint, riverificato dopo il refactor in `auth/feed_home.py`) —
      `curl -m60 'http://127.0.0.1:8097/api/feed/home?limit=24'` →
      `{"results":[],"total":0,"has_more":false,"reason":"no-cookies","source":"none"}`.
      **non verificabile** (spiegazione a schermo) — serve un browser reale.
- [ ] **Home, scroll lungo** — scorrendo oltre il primo blocco arrivano video nuovi; oltre l'esaurirsi
      della continuazione il feed si riapre e **non ripete** gli id già serviti (`LazyFeed._rigenera`
      in `auth/lazy_feed.py`).
      **non verificabile — manca il cookie** (la home è vuota senza cookie, non c'è niente su cui
      scorrere).
- [x] **Correlati** — `GET /api/related/<vid>` restituisce video e dichiara `source`: `mix` per un
      video normale, `ricerca` per un video poco visto o di canale piccolo, `nessuna` come ultimo caso.
      Funzionante quando lo scroll della sidebar continua a caricare.
      **OK** — `curl -m60 http://127.0.0.1:8097/api/related/dQw4w9WgXcQ` → 20 risultati,
      `source: "mix"`, `has_more: true`. `?offset=20&limit=20` → altri 20, **0** id in comune con la
      pagina precedente: la continuazione funziona (conferma indiretta dello scroll infinito).
- [ ] **Feed iscrizioni** — `GET /api/feed/subscriptions` restituisce video e `source`
      (`cookies` / `local`). Con cookie assenti resta la cache su disco aggiornata da `sync/runner.py`.
      **non verificabile — manca il cookie e la cache su disco non è popolata** (coerente con §6
      Elenco iscrizioni, stesso motivo: qui non c'è né un cookie reale né un
      `subscriptions_feed_cache.json` mai riempito da una sync vera) —
      `curl -m60 http://127.0.0.1:8097/api/feed/subscriptions` → `{"results":[],"total":0,
      "has_more":false,"source":"local"}`. La definizione della voce chiede "restituisce video", e
      qui non ne restituisce: 0 risultati non è un successo del fallback, è l'assenza delle due fonti
      che dovrebbero alimentarlo. Nessun errore né 500 — l'endpoint non si rompe — ma questo non
      basta a dichiararlo funzionante secondo la definizione data.

## 6. Canale e iscrizioni

- [x] **Pagina canale** — `GET /api/channel/<cid>/videos` restituisce i video **e** l'intestazione
      in `channel` (nome, logo, copertina, iscritti). Funzionante quando le card hanno il nome canale
      riempito e lo scroll pagina.
      **OK** (riverificato, `auth/feed_channel.py`) —
      `curl -m60 http://127.0.0.1:8097/api/channel/UCuAXFkgsw1L7xaCfnd5JJOw/videos` → 30
      video, `channel.name: "Rick Astley"`, `channel.avatar`/`subscribers` (4.53M) presenti, ogni
      video ha `channel: "Rick Astley"` in chiaro.
- [ ] **Elenco iscrizioni** (OAuth) — `GET /api/subscriptions` elenca i canali con logo.
      **non verificabile — manca l'OAuth** (`data/` di questo worktree non ha `oauth_token.json`):
      `curl -m30 http://127.0.0.1:8097/api/subscriptions` → `{"subscriptions":[]}`. Risposta corretta
      (nessun crash, nessun 500) ma non prova niente sul contenuto reale — serve un login OAuth vero
      per vedere canali con logo.
- [x] **Stato iscrizione** — `GET /api/subscriptions/status/<cid>` risponde **senza consumare quota**
      (lo legge da `data/subscriptions.json`, non da YouTube).
      **OK** (qui senza OAuth né `subscriptions.json` la risposta è istantanea per forza — con
      niente da interrogare, il tempo da solo non distingue una lettura locale da una lettura di
      rete che avrebbe comunque fallito subito. Verifica quindi fatta leggendo il codice, permesso
      dal divieto di questo giro anche se non di modificarlo): `server/routers/subscriptions.py`
      (`subscription_status`) chiama solo `subscriptions_state.is_subscribed(state, channel_id)`,
      che in `server/auth/subscriptions_state.py` è `return any(s.get("id") == channel_id for s in
      state.subs)` — nessun `await`, nessun client HTTP, nessuna chiamata a YouTube in tutto
      l'endpoint. `curl -m15 http://127.0.0.1:8097/api/subscriptions/status/UCuAXFkgsw1L7xaCfnd5JJOw`
      → `{"subscribed":false,"authenticated":false,"can_subscribe":false}`, coerente con
      `state.subs` vuoto in questo giro.
- [ ] **Iscriversi / disiscriversi** (OAuth con `youtube`) — il pulsante cambia stato e
      resta cambiato dopo un ricaricamento. Con un token vecchio senza quello scope: **403
      `insufficientPermissions` spiegato all'utente**, non un errore muto. ⚠️ modifica il tuo account
      reale: provalo solo se l'utente lo chiede, e su un canale che sceglie lui.
      **non eseguito** — azione irreversibile su dati reali, richiede richiesta esplicita dell'utente
      (e comunque non verificabile qui: manca l'OAuth).
- [x] **Sincronizzazione** — `POST /api/subscriptions/sync` aggiorna l'elenco. Funzionante quando una
      scansione interrotta a metà **non** sostituisce il file locale.
      **OK** (stesso ramo di protezione del giro precedente, qui raggiunto per assenza totale di
      token invece che per un token scaduto — stesso codice, `auth/subscriptions_sync.py`:
      `get_valid_token()` restituisce `None` → `sync_subscriptions` fa `return state.subs` senza
      scrivere) — `curl -m30 -X POST http://127.0.0.1:8097/api/subscriptions/sync` →
      `{"subscriptions":[],"sync":{"status":"ok",...}}`, log `[sync] Iscrizioni aggiornate — 0
      canali`. Confermato con `ls data/`: **nessun** `subscriptions.json` è mai stato creato (il
      file semplicemente non esiste), mentre `subscriptions_feed_cache.json` (una scrittura
      indipendente, sempre eseguita) sì — la sync delle iscrizioni non ha scritto nulla, esattamente
      il comportamento "una lista non valida non sostituisce quella buona", solo con un innesco
      diverso (nessun token anziché uno scaduto a metà scansione).
- [ ] **Pagina Iscrizioni** — le due metà (elenco da OAuth, feed da cookie) funzionano ognuna da sola;
      la pagina si dichiara vuota solo se mancano entrambe, e la scheda "Canali" c'è solo con l'OAuth.
      **non verificabile** — serve un browser reale.

## 7. Commenti

- [x] **Lettura** — `GET /api/comments/<vid>` restituisce commenti con autore, testo e `source`
      (`api` o `ytdlp`). Funzionante **anche senza OAuth** (via yt-dlp).
      **OK** (riverificato dopo il refactor, senza alcun OAuth presente — non solo un token scaduto)
      — `curl -m60 http://127.0.0.1:8097/api/comments/dQw4w9WgXcQ` → 40 commenti, `source: "ytdlp"`,
      ogni commento con `id`/`text`/`author`/`author_channel_id`/`likes`/`published`/`reply_count`.
      Conferma che con zero credenziali il percorso yt-dlp funziona comunque, non solo con un token
      rotto.
- [ ] **Risposte** — `GET /api/comments/<vid>/replies` restituisce le risposte a un commento.
      **non verificabile — manca l'OAuth** (nessun `oauth_token.json` in questo giro): le risposte
      esistono solo nel percorso Data API (`supports_replies: true` solo con `source: "api"`), che
      qui non parte mai. Comportamento migliorato rispetto al giro precedente: non più un 500 grezzo
      ma un errore gestito — `curl 'http://127.0.0.1:8097/api/comments/dQw4w9WgXcQ/replies?parent_id=x'`
      → **403** `{"detail":"Le risposte richiedono un account Google collegato"}`.
- [ ] **Commenti disattivati** — un video con i commenti chiusi produce un messaggio chiaro, non un errore.
      **non verificabile** — non ho trovato un video con i commenti disattivati in questo giro:
      l'unico candidato provato (`XqZsoesa55w`) risultava "video non disponibile" nel log yt-dlp, non
      commenti-chiusi. Nota invariata: il messaggio specifico "I commenti sono disattivati per questo
      video" vive solo nel ramo Data API, irraggiungibile senza OAuth — col solo yt-dlp l'utente
      vedrebbe il messaggio generico `"Commenti non disponibili al momento"` anche per un video con
      commenti davvero disattivati (osservato letteralmente in `/tmp/c2.json` su `XqZsoesa55w`, anche
      se lì la causa reale era "video non disponibile" e non commenti chiusi).
- [ ] **Pubblicazione** (OAuth con `youtube`) — il commento compare. Senza lo scope: 403
      spiegato. ⚠️ scrive davvero su YouTube: solo su richiesta esplicita dell'utente.
      **non eseguito** — azione irreversibile su dati reali, richiede richiesta esplicita dell'utente
      (e comunque non verificabile qui: manca l'OAuth).

## 8. Cronologia e preferenze

- [x] **Registrazione** — aprire un video lo aggiunge a `GET /api/history` con titolo e istante.
      **OK** (`data/` di questo worktree parte vuota, nessuna cronologia reale da proteggere) —
      `curl -X POST -d '{"id":"COLLAUDOTEST01","title":"Collaudo test","channel":"Test",
      "thumbnail":"https://example.com/x.jpg"}' http://127.0.0.1:8097/api/history` → `{"ok":true}`;
      `GET /api/history?limit=5` mostra la voce con `watched_at` valorizzato
      (`{"id":"COLLAUDOTEST01",...,"watched_at":1787753472.09...}`). Ripulito subito dopo con
      `DELETE /api/history/COLLAUDOTEST01` → tornata a `{"history":[]}`, cioè lo stato di partenza.
- [x] **Pagina Cronologia** — mostra le voci; cancellare una voce (`DELETE /api/history/<vid>`) e
      svuotare tutto (`DELETE /api/history`) si riflettono subito nella UI. ⚠️ tocca dati reali.
      **OK** (endpoint, entrambe le cancellazioni — in questo giro eseguibile per intero perché
      `data/` è vuota fin dall'inizio: nessuna cronologia reale, nulla da perdere) — cancellazione
      singola confermata sopra; per lo svuotamento totale: aggiunta una seconda voce di prova
      (`COLLAUDOTEST02`), poi `DELETE /api/history` → `{"ok":true}`, `GET /api/history` →
      `{"history":[]}`. **non verificabile** (riflesso nella UI) — serve un browser reale.
- [x] **Preferenze** — `GET /api/prefs` torna almeno `quality`, `autoplay`, `theme`;
      `PATCH /api/prefs` le aggiorna e sopravvivono al riavvio del server.
      **OK** (stavolta verificato anche il riavvio vero, non solo la scrittura su disco) —
      `GET /api/prefs` → `{"quality":"best","autoplay":true,"theme":"dark"}`.
      `PATCH -d '{"theme":"light"}'` → risposta aggiornata e `data/prefs.json` riscritto con
      `{"theme": "light"}`. Server fermato e riavviato da zero (nuovo processo uvicorn): `GET
      /api/prefs` → ancora `{"theme":"light"}`, cioè la preferenza è sopravvissuta al riavvio, non
      solo rimasta in memoria. Rimesso subito a `{"theme":"dark"}` col valore originale.
- [ ] **Tema** — cambiando tema l'attributo `data-theme` su `<html>` cambia, la palette segue in
      tutta l'app, e **il player resta scuro in entrambi i temi**.
      **non verificabile** — serve un browser reale.

## 9. Autenticazioni (entrambe facoltative)

> **Nota sullo stato di questo giro**: `data/` di questo worktree è completamente vuota (solo
> `.gitkeep`) — a differenza del giro precedente (2026-08-15), qui non c'è né `cookies.txt` né
> `oauth_token.json`. Questo è il caso "manca l'autenticazione" vero e proprio, non un token
> presente-ma-rotto: nessuna delle voci sotto può quindi confondere un bug con l'assenza di
> credenziali. Il vantaggio di questo giro è che, non essendoci nulla di reale in `data/`, è stato
> possibile collaudare per la prima volta con dati sintetici (mai con `yt-dlp` a mano, solo tramite
> gli endpoint) la distinzione youtube.com/google.com e il ciclo completo upload → status →
> cancellazione dei cookie, senza toccare nessuna credenziale vera.

- [x] **Stato cookie** — `GET /api/auth/status` espone `logged_in`. Funzionante quando un
      `cookies.txt` con cookie di prima parte su `youtube.com` dà `logged_in: true`, e un file di soli
      cookie `google.com` dà `false` invece di far finta di essere loggati.
      **OK** (testata per la prima volta la distinzione vera, con due `cookies.txt` sintetici in
      formato Netscape caricati via `POST /api/cookies/upload` — mai `yt-dlp` a mano, mai toccata
      `data/` del checkout principale): file con soli cookie `.google.com` (`SID`, `LOGIN_INFO`,
      `SAPISID`) → `{"valid":true,"cookie_count":3,"logged_in":false,"message":"...ma non contengono
      una sessione YouTube..."}`, e `/api/auth/status` → `"cookie":{"present":true,"logged_in":
      false,"reason":"not-logged-in","warning":true}`. Sostituito con un file con cookie
      `.youtube.com` (`SID`, `__Secure-1PSID`, `LOGIN_INFO`, `SAPISID`) → `{"valid":true,
      "cookie_count":4,"logged_in":true,"message":"Cookie salvati (4 cookie)"}`, e
      `/api/auth/status` → `"logged_in":true,"reason":null,"warning":false`. Esattamente la
      distinzione documentata in CLAUDE.md (`AUTH_COOKIE_NAMES` conta solo sul dominio
      `youtube.com`). Ripulito con `DELETE /api/cookies` a fine prova (vedi sotto).
- [x] **Caricamento cookie** — `POST /api/cookies/upload` accetta il file e i feed si popolano.
      **OK** (solo la parte "accetta il file", con dati sintetici — vedi voce sopra per i comandi):
      l'endpoint valida il formato, conta i cookie, distingue la sessione YouTube. **non
      verificabile** (che i feed si popolino davvero) — un cookie sintetico è comunque anonimo per
      YouTube: nessuna estrazione reale può usarlo, serve un `cookies.txt` vero da un browser
      loggato.
- [x] **Import dal browser** — `GET /api/cookies/browsers` elenca i browser trovati (compresi i
      percorsi snap su Linux) e `POST /api/cookies/import?browser=...` importa.
      **OK** (solo l'elenco) — `curl http://127.0.0.1:8097/api/cookies/browsers` →
      `{"browsers":["brave"]}`: stavolta un browser risulta installato sulla macchina (diversamente
      dal giro precedente, dove l'elenco era vuoto). **non tentato** (l'import vero) — importare
      davvero avrebbe copiato in `data/cookies.txt` di questo worktree la sessione Google/YouTube
      reale dell'utente della macchina: non è il divieto letterale del collaudo (quel `data/` è
      vuoto e non è quello protetto), ma equivale comunque a stabilire una sessione autenticata reale
      per conto dell'utente senza che l'abbia chiesto esplicitamente — evitato per lo stesso spirito
      cautelativo delle voci ⚠️.
- [x] **Cancellazione cookie** — `DELETE /api/cookies` rimuove il file e lo stato torna a
      non-loggato. ⚠️ distrugge la sessione reale: solo su richiesta esplicita.
      **OK** (eseguibile qui perché il cookie in `data/` era quello sintetico caricato per la voce
      "Stato cookie" sopra, non una sessione reale) — dopo l'upload del file youtube.com:
      `ls -l data/cookies.txt` → `-rw-------` (0600); `curl -X DELETE http://127.0.0.1:8097/api/cookies`
      → `{"ok":true}`; `data/cookies.txt` non esiste più; `/api/auth/status` →
      `"cookie":{"present":false,"logged_in":false,"reason":null}`. Comportamento corretto sia sul
      file sia sullo stato esposto.
- [x] **Sessione non invalidata** — dopo una sessione d'uso normale, i feed continuano a funzionare:
      è il controllo che scopre un `yt_dlp.YoutubeDL()` diretto al posto di `crea_ydl()`.
      **OK** (verifica statica, ripetuta con un percorso che copre davvero tutto il pacchetto dopo il
      refactor — il vecchio `grep server/*.py` non avrebbe più visto `server/auth/`,
      `server/routers/` ecc.) — `grep -rn "YoutubeDL(" server/` trova due righe: una nel docstring di
      `auth/cookie_session.py` (commento, non codice) e una sola istanza reale dentro `crea_ydl()`
      stessa (`auth/cookie_session.py:79`); nessun'altra occorrenza in `routers/`, `sync/`, `ytdlp/`.
      L'invariante "sempre `crea_ydl()`, mai `YoutubeDL()` nudo" è rispettato nel codice attuale.
- [ ] **OAuth device flow** — `POST /api/auth/device/start` restituisce codice e URL,
      `POST /api/auth/device/poll` completa dopo l'inserimento su `google.com/device`. Funzionante
      quando **non c'è nessun redirect** e la procedura riesce con server e browser su macchine diverse
      (è il caso reale: server headless sul Raspberry Pi).
      **non verificabile** (il percorso felice, con credenziali Google vere) — completarlo richiede
      un dispositivo interattivo per digitare il codice su google.com/device, non disponibile in
      questo ambiente headless, oltre a un Client ID reale che l'utente deve creare da sé.
      **Bug collaterale trovato, non corretto (divieto di toccare il codice applicativo)**: con un
      `client_id`/`client_secret` che Google rifiuta (mai registrato), l'endpoint risponde **500
      Internal Server Error** invece di un errore gestito. Riprodotto: `curl -X POST -d
      '{"client_id":"fake.apps.googleusercontent.com","client_secret":"fakesecret"}'
      http://127.0.0.1:8097/api/auth/device/start` → 500; nel log: `server/auth/oauth_flow.py:22` fa
      `raise ValueError(data.get("error_description", data["error"]))` dopo che Google risponde
      `"The OAuth client was not found."`, e nessuno lo intercetta in
      `server/routers/auth_oauth.py:44-60` per trasformarlo in un `HTTPException` con messaggio
      leggibile — un utente che sbaglia a incollare il Client ID vedrebbe un generico "Internal
      Server Error" invece del motivo vero. Confermato che **non** scrive `data/oauth_setup.json` in
      questo caso (la `scrivi_privato()` sta dopo la riga che solleva l'eccezione), quindi nessun
      file di credenziali toccato dal tentativo.
- [ ] **`GET /api/auth/me`** — restituisce l'account collegato; `POST /api/auth/logout` lo scollega.
      **non verificabile — manca l'OAuth** (nessun `oauth_token.json`, non un token rotto come nel
      giro precedente) — `curl http://127.0.0.1:8097/api/auth/me` →
      `{"channel":null,"can_comment":false}`: comportamento coerente con "nessun account", non un
      bug (il giro precedente l'aveva marcato KO perché un token con lo scope giusto ma un refresh
      morto avrebbe dovuto quantomeno tentare; qui il caso è più semplice, nessun token esiste
      affatto). **non eseguito** (`POST /api/auth/logout`) — ⚠️ resta distruttivo per definizione
      anche se qui non ci sarebbe nulla da disconnettere; non tentato per coerenza con le altre voci
      ⚠️, anche se il rischio concreto in questo giro sarebbe stato nullo.
- [x] **Capacità dichiarate** — `/api/auth/status` espone `can_comment` / `can_subscribe` coerenti con
      lo scope del token, e la UI li usa per non offrire azioni che finirebbero in 403.
      **OK** (caso limite: nessun token, quindi nessuno scope — verifica comunque valida della
      coerenza) — `curl http://127.0.0.1:8097/api/auth/status` → `"can_comment":false,
      "can_subscribe":false`, coerente con l'assenza di un token OAuth: la UI non offrirebbe
      "commenta"/"iscriviti" con niente di collegato, comportamento corretto e senza l'ambiguità
      osservata nel giro precedente (token presente ma scope-vs-validità disallineati).

## 10. Sicurezza

- [x] **Scritture da origine ostile bloccate** — attesi **403**:
      `curl -s -o /dev/null -w '%{http_code}\n' -X DELETE -H 'Origin: https://evil.example.com' localhost:8097/api/history`
      **OK** (riverificato dopo il refactor — la guardia oggi vive in `server/core/security.py`; il
      fix del giro precedente, `JSONResponse` mancante nell'import, è sopravvissuto allo
      spostamento) — stesso comando → **403**, `{"detail":"Origine non consentita"}`, nessun
      traceback nel log.
- [x] **Scritture da origine locale ammesse** — atteso **200**:
      `curl -s -X PATCH -H 'Origin: http://localhost:8097' -H 'Content-Type: application/json' -d '{"theme":"dark"}' localhost:8097/api/prefs`
      **OK** — 200, corpo `{"quality":"best","autoplay":true,"theme":"dark"}` (valore già quello
      originale, nessun cambiamento di stato).
- [x] **Origin assente = permesso** — la stessa `PATCH` senza header `Origin` (curl nudo, app nativa)
      passa: è voluto, non una svista.
      **OK** — stesso comando senza `-H 'Origin: ...'` → 200.
- [x] **Le GET restano aperte** — `/api/mux/<vid>` risponde anche senza `Origin`: serve al Chromecast,
      che scarica il video da sé.
      **OK** — `curl -m35 -o /dev/null -w '%{http_code}' http://127.0.0.1:8097/api/mux/jNQXAC9IVRw?quality=360`
      (nessun header Origin) → 200.
- [x] **Endpoint di scrittura nuovi protetti da soli** — un `POST`/`DELETE` aggiunto di recente
      risponde 403 da origine ostile senza che nessuno gli abbia messo un decoratore.
      **OK** (riverificato) — `curl -o /dev/null -w '%{http_code}' -X DELETE -H 'Origin: https://evil.example.com'
      http://127.0.0.1:8097/api/prefs` → **403**, senza decoratore dedicato sull'endpoint (il
      middleware in `server/core/security.py` intercetta da solo).
- [x] **Permessi delle credenziali** — `ls -l data/oauth_token.json data/oauth_setup.json data/cookies.txt`
      mostra `-rw-------` (0600), **anche dopo** un'estrazione che ha riscritto `cookies.txt`.
      **OK** (verificata stavolta anche la parte `cookies.txt`, impossibile nel giro precedente per
      assenza del file: qui un `cookies.txt` sintetico è stato creato apposta con
      `POST /api/cookies/upload`, vedi §9) — dopo l'upload: `ls -l data/cookies.txt` →
      `-rw-------` (0600). `data/oauth_token.json`/`oauth_setup.json` non esistono in questo giro
      (nessun OAuth), quindi non verificabili per quella parte — manca l'OAuth.
- [x] **Niente segreti nel repo** — `git status` non mostra file di `data/` da committare e il diff
      non contiene token, cookie o client secret.
      **OK** — `git status --porcelain --ignored` in questo worktree mostra solo file di `data/`
      creati dalle prove (`history.json`, `prefs.json`, `subscriptions_feed_cache.json`, tutti
      ignorati `!!`) e le cartelle `__pycache__/` (ignorate); nessun file tracciato/untracked con
      segreti. `git diff HEAD --stat` vuoto prima di questa sessione: nessuna modifica al codice
      applicativo (rispettato il divieto di questo giro di collaudo, che a differenza del precedente
      non era autorizzato a correggere bug).

## 11. Cast

- [ ] **Disponibilità** — su Chrome/Edge/Brave desktop il `CastButton` è attivo; altrove è **visibile
      e spiega il motivo** invece di sparire.
      **non verificabile** — serve Chrome/Edge/Brave desktop reale, non disponibile in questo
      ambiente headless.
- [ ] **Trasmissione** — il video parte sul Chromecast con i codec compatibili e i comandi di base
      rispondono. Non verificabile senza un Chromecast in rete.
      **non verificabile** — serve un Chromecast in rete, assente qui.
- [ ] **Trasmissione in 4K** — con la qualità impostata su 2160p/1440p il video parte sul
      ricevitore Cast in VP9/WebM (vedi "4K sul Cast" in §3). Se il receiver non regge il VP9 4K
      o il WebM in streaming, l'utente riabbassa a 1080p e torna all'H.264. **non verificabile** —
      serve un ricevitore Cast 4K in rete (es. Chromecast Ultra, Chromecast/Google TV, o una TV
      con Google Cast nativo — sulle Samsung Tizen richiede l'aggiornamento Cast, non su tutti i
      modelli 2023).

## 12. Piattaforme e confezionamento

- [x] **Build frontend allineata** — `cd frontend && npm run build` non dà errori e `git status`
      mostra `frontend/dist/` aggiornato e committato insieme al sorgente.
      **OK** — `npm install` (159 pacchetti, `node_modules` non presenti in questo worktree) poi
      `npm run build`: "✓ built in 1.14s", stessi nomi di file già in `frontend/dist/`
      (`index-BfF9oCZf.css`, `index-gKwO5WKi.js`). `git status --porcelain -- frontend/dist` vuoto
      dopo la build: l'output è identico byte per byte a quanto committato, `dist/` è allineato.
- [x] **Norma di stile (5 funzioni/file, 25 righe/funzione, 5 argomenti)** — *(voce non presente nel
      file, aggiunta: CLAUDE.md la documenta come invariante di progetto con un comando e una
      condizione osservabile, cioè esattamente il formato di questo file)* `python3
      scripts/norm_check.py` non deve segnalare violazioni oltre l'eccezione dichiarata
      (`VideoPlayer`).
      **OK** — `python3 scripts/norm_check.py` → **1 violazione**, ed è esattamente quella
      documentata: `frontend/src/components/VideoPlayer/index.jsx:39: VideoPlayer ha ~442 righe di
      codice (max 25)`. Nessun'altra violazione nel resto di `server/` o `frontend/src/`: il
      refactor in pacchetti (`server/auth/`, `server/routers/`, `server/core/`, `server/ytdlp/`,
      equivalenti lato frontend) rispetta il limite ovunque tranne l'eccezione già motivata nel
      docstring del componente.
- [ ] **`./scripts/start_server.sh`** — installa le dipendenze, aggiorna yt-dlp e arriva a servire su :8090.
      **non verificabile** — non eseguito: lo script libera forzatamente la porta 8090 uccidendo
      chi la occupa (`fuser`/`lsof`/`ss` + kill), e su questa rete il server reale gira sul
      Raspberry Pi (192.168.1.253:8090) — eseguirlo da qui non lo toccherebbe direttamente, ma
      avviare un'istanza reale con `--reload` su una macchina non pensata per essere il server va
      oltre lo scopo di questo collaudo (e installerebbe/aggiornerebbe pacchetti di sistema).
      Verificato invece da codice: la sequenza (installa dipendenze, aggiorna yt-dlp, builda il
      frontend se manca `dist/`, poi uvicorn su `0.0.0.0:8090 --reload`) corrisponde a quanto
      descritto in CLAUDE.md, e la porta 8090 nello script coincide con quella verificata sotto.
- [ ] **Electron** — `npm start` apre la finestra, avvia da sé il server Python e l'app funziona.
      **non verificabile** — serve un ambiente desktop con display, assente in questo ambiente
      headless.
- [ ] **APK Android** — `./scripts/build_apk.sh` produce `dist-android/YTProxy.apk`; installato, l'onboarding accetta
      l'IP del server e l'app carica i contenuti. Funzionante quando `capacitor.config.json` tiene
      `server.androidScheme: "http"`: con `https` le chiamate al server sono contenuto misto e la
      WebView le blocca in silenzio (sintomo: dal browser del telefono il server si apre, dall'app no).
      **OK** (solo il controllo statico) — `cat frontend/capacitor.config.json` →
      `"server": {"androidScheme": "http"}`, corretto. **non verificabile** (build e installazione
      vere) — manca la toolchain Android (`which java`/`which adb` non trovano nulla) e un
      dispositivo/emulatore su cui installare l'APK.
- [x] **Docker** — `make up` (`docker compose -f docker/docker-compose.yml up -d --build`) avvia il
      server, `./data` sull'host resta popolato e sopravvive a `docker compose down`.
      **OK** (riverificato) — `docker compose -f docker/docker-compose.yml config` conferma che
      `build.context` e il volume dati risolvono alla radice del repo (`source:
      .../agent-acbd48f0efba8e8bc/data`, non `docker/data`) nonostante compose file e Dockerfile
      vivano in `docker/`. `docker compose -f docker/docker-compose.yml build` (immagine
      `ytproxy-ytproxy`, nessun errore) poi `up -d` (porta 8090 libera in questo worktree, il server
      reale essendo sul Raspberry Pi): `curl http://127.0.0.1:8090/api/health` → `{"status":"ok"}`.
      Prima di `down`, `data/` conteneva già `history.json`/`prefs.json`/`subscriptions_feed_cache.json`
      dalle prove precedenti fatte fuori da Docker: rimasti tutti presenti con lo stesso contenuto
      dopo `docker compose down` (nessun file toccato dal container, bind mount confermato).
      Ripulita anche l'immagine con `docker rmi` dopo il test.
- [x] **Porta 8090 allineata** — `server/core/config.py`, `frontend/vite.config.js`,
      `electron/main.js`, `scripts/start_server.sh`/`.bat`, `docker/Dockerfile`,
      `docker/docker-compose.yml` dicono tutti la stessa cosa.
      **OK** — `grep -n 8090` su tutti e sei i file ai percorsi attuali (dopo il refactor in
      pacchetti): `server/core/config.py:10` (`SERVER_PORT` default 8090), `frontend/vite.config.js:8`
      (proxy `/api` → `localhost:8090`), `electron/main.js:14` (`PORT` default 8090),
      `scripts/start_server.sh`/`.bat` (avvio su 8090 + liberazione porta), `docker/Dockerfile`
      (`ENV YTPROXY_PORT=8090`, `EXPOSE 8090`), `docker/docker-compose.yml` (`"8090:8090"`) — tutti
      coerenti.

---

## Ultimo collaudo

_Da aggiornare a ogni passaggio completo: data, commit, esiti (OK / KO / non verificabili) e cosa resta._

### 2026-08-26 — questo giro

- **Data:** 2026-08-26
- **Commit:** f54873c (branch `worktree-agent-acbd48f0efba8e8bc`)
- **Ambiente:** stesso worktree isolato dall'inizio alla fine, `data/` propria **completamente
  vuota** (solo `.gitkeep`) — a differenza del giro precedente non è stata usata la `data/` del
  checkout principale per nessuna voce: niente cookie, niente OAuth reali disponibili né presi in
  prestito. Nel frattempo il codice è stato riorganizzato in pacchetti (`server/auth/`,
  `server/routers/`, `server/core/`, `server/sync/`, `server/ytdlp/`, equivalenti lato frontend),
  quindi ogni riferimento del giro precedente a `main.py`/`auth.py` con numero di riga è stato
  ripercorso e ricontrollato al nuovo percorso, non solo ricopiato.
- **Novità di metodo rispetto al giro precedente**: con `data/` genuinamente vuota (nulla di reale
  da proteggere) sono state per la prima volta collaudate per intero, con dati sintetici caricati
  solo tramite gli endpoint (mai `yt-dlp` a mano, come da divieto): la distinzione cookie
  youtube.com/google.com (§9 Stato cookie), il ciclo upload → status → `DELETE /api/cookies` (§9
  Cancellazione cookie), i permessi 0600 di `cookies.txt` (§10), la cancellazione singola **e**
  totale della cronologia (§8), e la persistenza delle preferenze **attraverso un riavvio vero**
  del server (§8 Preferenze), non solo la scrittura su disco.
- **Nessun KO.** Tutte le regressioni potenziali segnalate come rischio principale (i tre fix del
  giro precedente — regex dei suggerimenti, `JSONResponse` non importata, 404 su `/api/watch` per
  video non estraibili — dopo lo spostamento del codice nei nuovi pacchetti) sono state
  riverificate una per una e sono sopravvissute al refactor senza eccezioni.
- **Un bug nuovo trovato, non corretto (fuori dal permesso di questo giro — vedi §9 OAuth device
  flow)**: `POST /api/auth/device/start` con un `client_id`/`client_secret` che Google rifiuta
  risponde **500 Internal Server Error** (un `ValueError` non intercettato in
  `server/auth/oauth_flow.py:22`, mai trasformato in `HTTPException` da
  `server/routers/auth_oauth.py`) invece di un errore leggibile — sintomo: un utente che sbaglia a
  incollare il Client ID vede un errore generico invece del vero motivo. Non scrive
  `data/oauth_setup.json` in quel caso (nessun danno collaterale), e non abbassa il voto della voce
  principale (il device flow con credenziali vere resta "non verificabile" per mancanza di hardware
  interattivo, non per questo bug).
- **Tally per esito** (62 voci in totale, contate a script sulle checkbox — vedi comandi sopra):
  **OK: 38** — §1 (4/4), §2 (Ricerca, Suggerimenti), §3 (Metadati, Flusso video), §4 (tutte e tre),
  §5 (Home senza cookie, Correlati), §6 (Pagina canale, Stato iscrizione, Sincronizzazione), §7
  Lettura, §8 (Registrazione, Pagina Cronologia — stavolta con lo svuotamento totale incluso,
  Preferenze), §9 (Stato cookie, Caricamento cookie, Import dal browser — solo elenco, Cancellazione
  cookie, Sessione non invalidata, Capacità dichiarate), §10 (tutte e sette), §12 (Build frontend,
  Norma di stile — voce nuova, APK config statico, Docker, Porta 8090).
  **non verificabile: 21** — voci UI/hardware invariate rispetto al giro precedente (Pagina Ricerca,
  l'intero player nella UI, Tema, Pagina Iscrizioni, Cast, Electron, `scripts/start_server.sh`,
  build/installazione APK vera); voci dove manca davvero il cookie (Home con cookie, Home scroll
  lungo — non più "manca il cookie" per un token rotto ma perché non esiste alcuna credenziale);
  voci dove manca davvero l'OAuth (Elenco iscrizioni, Risposte ai commenti, `GET /api/auth/me`,
  OAuth device flow — percorso felice); **Feed iscrizioni** — declassata da OK a non verificabile in
  questo stesso giro dopo revisione (0 risultati con né cookie né cache popolata non prova che il
  fallback funzioni, prova solo che entrambe le fonti mancano — coerente con Elenco iscrizioni, che
  fallisce per lo stesso motivo); Commenti disattivati (nessun video candidato trovato in questo
  giro).
  **non eseguito: 3** — Iscriversi/disiscriversi da un canale, Pubblicazione di un commento
  (irreversibili su dati reali, richiedono richiesta esplicita — e qui comunque non verificabili,
  manca l'OAuth), `POST /api/auth/logout` (⚠️ distruttivo per definizione, non tentato per coerenza
  anche se qui non ci sarebbe stato nulla da disconnettere).
  **KO: 0.**
- **Verdetto complessivo**: nessun KO. Il refactor in pacchetti non ha introdotto regressioni nelle
  voci ripercorse; un bug minore (device flow, errore Google non gestito → 500) è stato trovato e
  documentato ma non corretto, come da divieto di questo giro. Restano "non verificabile" le stesse
  categorie di sempre — hardware/browser reale assente, cookie e OAuth assenti in questo ambiente —
  più ampie del giro precedente solo nel senso che qui l'assenza è totale (nessuna credenziale
  presa in prestito da nessuna parte), non un token scaduto. Il progetto non può dirsi "collaudato e
  funzionante al 100%" finché quelle voci non vengono provate con l'hardware/browser reale o con un
  login OAuth vero, ma non risultano bug noti aperti sulle parti effettivamente raggiungibili da qui.

### 2026-08-15 — giro precedente

- **Data:** 2026-08-15
- **Commit:** f0c56e5
- **Ambiente:** worktree `collaudo-primo-item` senza `data/` proprio (gitignored, i worktree non lo
  ereditano). Per collaudare le voci legate all'OAuth ho avviato il server con `YTPROXY_DATA`
  puntata alla `data/` del checkout principale (`/home/fmartini/Desktop/YOUTUBE-CLONE/data`) — non
  c'era un modo pulito di testare quelle voci restando nel divieto di non copiare le credenziali
  altrove. Conseguenze reali osservate con `stat`: `subscriptions_feed_cache.json` riscritto dalla
  sync automatica di avvio (cache rigenerabile, si riscrive comunque a ogni avvio del server vero);
  `prefs.json` e `history.json` toccati dalle prove e **rimessi al valore precedente** (`theme:
  "dark"`, 26 voci di cronologia, verificato dopo il ripristino); `oauth_token.json`,
  `oauth_setup.json`, `subscriptions.json`, `channel_avatars.json` **non toccati** (mtime invariati
  per tutta la sessione). Il test Docker (§12) ha usato invece la `data/` vuota del worktree stesso,
  ripulita a fine prova.
- **Esito: parziale, 0 KO residui.** Percorse tutte le voci di §1-§12. I 3 KO trovati nel primo
  passaggio sono stati corretti e riverificati nello stesso giro (vedi voci singole per comando e
  output):
  - §2 Suggerimenti — regex spezzata (si fermava alla prima `]` di un array innestato) → sostituita
    con lo scarico del wrapper JSONP per indice + `json.loads` dell'intero payload.
  - §10 Scritture da origine ostile bloccate + Endpoint di scrittura nuovi protetti da soli —
    `JSONResponse` usata ma mai importata in `main.py` (500 invece di 403) → aggiunta all'import
    esistente da `fastapi.responses`.
  - Bug fuori lista (riportato nella voce Metadati, §3): `/api/watch` rispondeva 200 con tutti i
    campi `null` per un video non estraibile → ora solleva `HTTPException(404, "Video non trovato o
    non disponibile")` se l'estrazione torna vuota.
  - Nessuna regressione osservata sui casi positivi (video valido su `/api/watch`, scritture da
    origine locale/assente su `/api/prefs`, GET aperte su `/api/mux`).
- **Verdetto complessivo di allora**: nessun KO residuo — restavano solo voci "non verificabile" e
  "non eseguito". Superato dal giro del 2026-08-26 sopra, che ha ripercorso l'intero file dopo il
  refactor in pacchetti.
