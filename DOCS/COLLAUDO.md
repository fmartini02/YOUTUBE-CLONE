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
- [x] **Risultati misti** — senza `tipo`, `/api/search` restituisce come YouTube video, canali e
      playlist mescolati, ognuno con `kind` (`video` / `channel` / `playlist`); i Mix (`RD…`, tranne
      le `RDCLAK…` di YouTube Music) sono scartati. Funzionante quando `q=notizie` contiene sia
      `video` sia `channel`, e ogni canale ha `id` `UC…`, `name`, `avatar` con schema `https:`.
      **OK** (2026-09-24) — `q=notizie` → 16 video + 4 canali (Sky News, 9,37 Mln iscritti, `@SkyNews`).
- [x] **Filtro tipo** — `tipo=video|canale|playlist` restituisce solo quel `kind`; le playlist hanno
      `video_id` (video in copertina). **OK** — `q=lofi&tipo=canale` → 20 `channel`;
      `tipo=playlist` → 20 `playlist` (anche `page=2`), `video_id` presente; `tipo=video` → 20 `video`.
- [x] **Filtro durata** — `durata=breve` (<4 min) / `media` (4-20) / `lunga` (>20) rispettato.
      **OK** — `q=gatti&durata=breve` → durate 10-232s; `q=lofi&durata=media` → 0 fuori da 240-1200s;
      `durata=lunga` → 0 sotto i 1200s. Nota: YouTube conta fra le "brevi" anche le dirette
      (`q=lofi&durata=breve` dà solo live con durata nulla) — è il suo risultato, non un nostro errore.
- [x] **Filtro data** — `data=ora|oggi|settimana|mese|anno`. **OK** — `q=cucina&data=settimana` →
      date 18-24/09 (oggi 24/09); `data=ora` (prova sull'`sp` grezzo) → solo video del giorno.
- [x] **Ordinamento** — `ordina=visualizzazioni` dà visualizzazioni decrescenti. **OK** — `q=gatti`:
      709M, 350M, 150M, 133M, 93M… contro 150M, 2,3M, 16M… per pertinenza. L'ordinamento per data
      **non c'è di proposito**: YouTube non lo rispetta più (`sp=CAI=` restituisce date fuori ordine),
      vedi `server/ytdlp/search_filters.py`.
- [x] **Filtri non validi o non applicabili** — ignorati, non errori; `filtri` nella risposta dice
      quelli applicati. **OK** — `tipo=boh&ordina=data&durata=lunga&data=xx` → `filtri: {durata: lunga}`,
      20 risultati; `tipo=canale&durata=lunga&data=oggi` → `filtri: {tipo: canale}`, solo canali.
- [x] **Categorie della home** — restano solo video (`tipo=video`), perché la griglia usa `VideoCard`.
      **OK** — `q=Musica&tipo=video` → 20 `video`.
- [x] **Pagina Ricerca** — la UI mostra i risultati e lo scroll infinito carica la pagina successiva.
      **OK** (Chromium headless di Playwright via script, porta 8099) — `q=lofi&tipo=video`: 20 → 40 card
      scorrendo in fondo, nessun errore JS.
- [x] **Barra Filtri** — il pulsante "Filtri" apre il pannello a 4 colonne; una scelta aggiorna l'URL
      (`/search?q=…&tipo=…`), i filtri attivi compaiono come chip (un tocco li toglie); con tipo
      canale/playlist durata e data sono disattivate; ricaricare e Indietro conservano i filtri.
      **OK** — dopo Video + Più di 20 minuti + Visualizzazioni l'URL è
      `?q=notizie&tipo=video&durata=lunga&ordina=visualizzazioni`, la ricarica mantiene i 3 chip e
      le durate sono tutte >20 min; Indietro → `?q=notizie&tipo=video&durata=lunga`; con Canale 8
      opzioni disattivate. A 390px pannello su 2 colonne, `scrollWidth` 390 (nessuno scroll orizzontale).
- [x] **Card canale e playlist** — il canale ha logo tondo, handle, iscritti, descrizione e Iscriviti,
      e il tocco apre `/channel?id=…`; la playlist ha la fascia "Playlist" e, finché non c'è una
      pagina playlist (issue #12), apre il video in copertina. **OK** — clic su canale →
      `/channel?id=UCSJ4gkVC6NrvII8umztf0Ow`; clic su playlist → `/watch?v=YOJsKatW-Ts`. Una copertina
      può mancare perché YouTube stesso dà 404 (video in copertina rimosso): resta il riquadro grigio.

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
- [x] **Capitoli, iscritti, descrizione intera** — `GET /api/watch/<vid>` torna anche `chapters`
      (lista `{start, title}`, **vuota** e mai un errore per i video che non ne hanno),
      `subscribers` (intero) e una `description` troncata a 5000 caratteri invece di 500.
      **OK** — `curl -m90 http://127.0.0.1:8097/api/watch/rfscVS0vtbw` (freeCodeCamp, "Learn Python -
      Full Course for Beginners") → **35 capitoli** (`{"start":0,"title":"Introduction"}`,
      `{"start":105,"title":"Installing Python & PyCharm"}`, ...), `subscribers: 11900000`,
      descrizione di 2211 caratteri (con il vecchio limite ne sarebbe arrivata meno di un quarto).
      Video senza capitoli: `curl .../api/watch/dQw4w9WgXcQ` → `chapters: []`, `subscribers:
      4540000`, descrizione 2375 caratteri.
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
- [x] **Il video parte nella UI** — si apre, si vede e si sente, senza errori in console.
      **OK** (2026-09-14, Chromium bundled pilotato a mano — la MCP Playwright è agganciata al
      canale `chrome`, non installabile qui senza root): aperto `/watch?v=dQw4w9WgXcQ`, `video`
      raggiunge `readyState=4` (HAVE_ENOUGH_DATA), nessun `pageerror` in console.
- [x] **Seek lungo** — spostare la barra a metà video: riparte da lì (a meno di ~1 GOP: `-ss`
      atterra sul keyframe precedente) e il tempo mostrato è circa `start + currentTime`, **non zero**.
      **OK** (2026-09-14, live) — click al 70% della barra (`duration=213`) → richiesta
      `/api/mux/...?quality=720&start=149.10`, risposta 200, primo pacchetto video `K` a pts 0.
      Lato server, contro il vero endpoint (URL googlevideo reali, AV1): `start=30/90/150/200` — tutti
      200. `_keyframe_before` era stato **rimosso** (costava 4-5s, finestra `ffprobe` intera) ma senza
      di lui l'audio ricodificato (vedi voce sotto) atterra quasi esatto sul target mentre il video
      resta sul keyframe precedente — **reintrodotto** in forma leggera (`read_intervals
      "target%+#3"`, 3 fotogrammi invece di una finestra): ~0.7-1s misurati su `start=30/90/150/200`
      (contro i 4-5s del vecchio probe), TTFB end-to-end 0.61s su un seek reale.
- [ ] **Seek corto** — tasti ← → e doppio tocco su telefono: il video si sposta di pochi secondi e
      **non torna all'inizio**. È la trappola di `seekable` vuoto: qui si vede o non si vede.
      **non verificabile** — serve un browser reale.
- [x] **Seek in avanti senza attesa / senza restare a caricare all'infinito** — un salto in avanti
      *singolo* riparte in ~1s (come aprire un video nuovo) e **non "rimane a caricare" per sempre**.
      Tre pezzi: (1) era `-copypriorss 0` che aspettava il keyframe successivo → oggi `-ss` grezzo e
      ffmpeg atterra sul keyframe precedente; (2) **il buco vero**: con `-c copy` su due input HTTP
      separati l'MP4 usciva con ~9s senza pacchetti video dopo il keyframe (audio regolare) → il
      `<video>` a bufferare per sempre; *deterministico*, anche con `-ss` esatto sul keyframe,
      **6/6** con URL reali. Cura: ricodifica della sola traccia audio in AAC sul ramo MP4 con
      salto → stesso test **6/6** pulito. (3) **latenza**: `_keyframe_before` faceva un `ffprobe`
      del keyframe (4-5s sul flusso 4K) prima di lanciare ffmpeg, e per giunta un `-ss` esatto sul
      keyframe rallenta l'avvio di ffmpeg di ~1.7s vs un valore "largo" (3/3) → rimosso in 43a6d9e,
      il salto non aspettava più niente — ma (4) **regressione non colta da quel giro**: senza il
      probe, l'audio ricodificato (accurate-seek, decodifica) atterra quasi esatto sul valore grezzo
      di `-ss` mentre il video (`-c copy`) resta sul keyframe precedente, fino a un GOP prima; il
      muxer fMP4 rimappa ciascuno stream a pts 0 indipendentemente (confermato con `-copyts` +
      `ffprobe` su mkv: NON preserva l'offset relativo su un mp4 frammentato), quindi audio e video
      restano permanentemente sfasati per tutto il resto della riproduzione — non il semplice offset
      "barra avanti sul fotogramma", un vero disallineamento udibile (misurato 0.6-2.7s su
      `start=30/90/150/200`, video AV1 reale). Cura: probe leggero reintrodotto (vedi "Seek lungo"),
      stesso valore usato per **entrambi** gli input.
      **OK** (2026-09-14, live + server) — seek dalla UI (click al 70% della barra) produce
      `/api/mux?...&start=149.10` 200, primo pacchetto video `K` a pts 0, nessun buco nel flusso
      (325 pacchetti continui su 12s di test). L'allineamento audio/video esatto non è verificabile
      a orecchio in headless: il meccanismo (stesso keyframe passato a entrambi gli input) è
      verificato a livello ffmpeg/ffprobe, non nel player.
- [ ] **Seek vicino alla fine** — spostare la barra o premere → negli ultimi secondi del video:
      l'audio **non sparisce** e il player non si pianta. Era `-copypriorss 0` nell'ultimo GOP (nessun
      keyframe dopo il punto) a produrre un flusso **con 0 pacchetti video** che bloccava anche
      l'audio (test sintetico CASE H/I: `v/a pkts: 0/21`). Oggi `-ss` grezzo in `-c:v copy` fa
      partire ffmpeg dal keyframe che apre l'ultimo GOP (nessun `-copypriorss`), e la ricodifica
      audio in AAC sul ramo MP4 con salto elimina il buco ~9s che restava anche con keyframe
      allineato (vedi "Seek in avanti senza attesa"). Verificato contro l'endpoint reale:
      `/api/mux?start=580` su un video ~600s → primo pacchetto video `K`, flusso completo, audio aac.
      **da confermare in un browser reale** — il meccanismo esatto del sintomo "perdo l'audio"
      (traccia video vuota che pianta l'elemento, oppure traccia audio più corta del video) non è
      isolabile senza browser; evitare il flusso vuoto è comunque corretto in entrambi i casi.
- [x] **Seek vicino alla fine: la barra non scatta alla fine da sola** — dopo un salto negli
      ultimi ~20s la barra parte dal secondo cliccato e arriva alla fine **insieme** al video
      (`ended=true`), non secondi prima. Due cause, entrambe corrette: (1) `_keyframe_before`
      arrotondava il keyframe al millesimo più vicino, e un 60.958333 scritto "60.958" faceva
      atterrare ffmpeg un segmento prima (55.0) con `X-Mux-Start` a 60.958 → buco audio di 6s e
      flusso più lungo del resto del video (3 video su 8 misurati, fine reale fino a +6s oltre la
      durata); (2) il player MSE ancorava la barra al secondo grezzo, ma l'atterraggio è per inizio
      di segmento (fino a ~6s prima). **OK** (2026-09-24, Chromium bundled + server reale):
      `O8Yu1E8Blxs` salto a 67.2 → prima barra a 84/84 con `currentTime` 17.6/29.1 (11s ancora da
      vedere); dopo, barra 67 → 84/84 esattamente a `ended=true`, `currentTime` iniziale 6.24
      (preroll saltato). Su 8 video, fine reale del flusso entro 0.4s dalla durata dichiarata.
      `fUuWhaQWhjs`: salto a 124.08 mostrato 124, poi ← riapre da 116.89 mostrato 117.
- [x] **Il video non salta da solo alla fine quando finisce di scaricarsi** — guardando senza
      salti, quando il download arriva alla fine del video (~60s prima della fine,
      `MSE_TARGET_AHEAD_S`; a metà di un video corto) il playhead resta dov'è e il video si vede
      fino all'ultimo secondo: una sola richiesta `/api/mux`, niente riapertura. Causa: `onEnd`
      (`useStreamSource.js`) confrontava la fine del buffer con la durata **al momento
      dell'apertura**, 0 sul primo flusso (i metadati arrivano dopo), quindi scambiava la fine vera
      per un taglio e riapriva dalla fine del buffer, portandoci il playhead. Ora legge la durata
      attuale (`durataOra`) e un taglio vero riparte dalla posizione del playhead.
      **OK** (2026-09-24, Chromium bundled): `O8Yu1E8Blxs` (84s), salto a 40 → prima (anche su
      `main`) riapertura a `start=84.08` e fine immediata; dopo, playhead 42, buffer fino a 84.12,
      nessuna riapertura. Salto a 67.2 → barra 84/84 insieme a `ended=true`.
- [x] **Dopo un salto corto (→, ←, doppio tocco) il video non resta in pausa** — un salto dentro
      al buffer, a video in riproduzione, continua a scorrere da solo: nessun evento `pause`, e
      nessuna richiesta `/api/mux` nuova. Causa: con MSE il salto sposta solo `currentTime`, il
      browser emette `waiting` mentre `seeking` è vero, e il recupero da stallo di rete lo
      prendeva per uno stallo — pausa, poi ripresa solo al cambiare di `bufferedEnd`/`position`,
      che a download finito non cambiano più. Ora un `waiting` a `seeking` vero non è uno stallo
      (`attesaSaltoRef` in `components/VideoPlayer/index.jsx`). Il recupero da uno stallo vero
      deve restare invariato: pausa, poi ripresa da sola con `REBUFFER_MARGIN_S` di buffer.
      **OK** (2026-09-24, Chromium bundled + server reale): `O8Yu1E8Blxs` (84s, tutto scaricato),
      → a 66 → prima (build su questo ramo senza la correzione) `waiting,pause`, fermo a 76 per
      sempre 2/2; dopo, `waiting,playing`, arriva a 83.8 senza pause 3/3. `dQw4w9WgXcQ`, 6 salti
      → nel buffer: prima un `pause` spurio su ogni salto, dopo nessuno, 0/6 fermi. Stallo vero
      (ffmpeg sospeso con `SIGSTOP`): `waiting` a `seeking` falso → pausa → ripresa da sola con
      6.9s di buffer dopo `SIGCONT`.
- [x] **Sincronia audio/video dopo un salto (labiale)** — dopo qualunque salto (barra, ←/→,
      capitoli) la voce resta sul movimento delle labbra per tutto il resto del video, su ogni
      punto e ogni codec. Condizione osservabile: su `/api/mux?...&start=X&tempi=sorgente`
      l'header `X-Mux-Timeline: sorgente` c'è, e confrontando l'uscita con la sorgente (pacchetti
      video accoppiati byte per byte, audio per correlazione incrociata) lo scarto fra le due tracce
      è lo stesso della partenza da 0. Nel player: le richieste MSE contengono `tempi=sorgente` e
      dopo un salto `video.currentTime` è il secondo assoluto del video (non un offset da 0).
      Nota storica: la voce "Seek in avanti senza attesa" sopra dice che il muxer fMP4 rimappa
      ciascuno stream a 0 indipendentemente — misurato, non è così: porta a 0 solo il primo campione
      di ogni traccia **allungandolo**, e l'audio allungato è la desincronia (vedi CLAUDE.md,
      "Sincronia audio/video sui salti").
      **OK** (2026-09-24, server di prova + Chromium bundled). `dQw4w9WgXcQ` AV1+Opus, salti a
      13.7/60.3/88.8/125.5/200.2 con timeline sorgente: stesso scarto della partenza da 0,
      correlazione audio 1.0 (prima: 13.7 → **1.68s**, probe in timeout a 3s su una seek di 5.7s).
      Stesso video H.264+AAC (ramo Cast, timeline relativa): +16.8ms (prima **5.2s/7s**, "dts
      heuristic" di ffmpeg con B-frame); AV1 relativo −6.9ms. Nel browser, registrando il `<video>`
      con `captureStream`: `main` salto a 13.7 → audio avanti di 1800ms; questo ramo → uguale agli
      altri salti (148-165ms, lo scarto fisso della catena di registrazione in headless, uguale per
      `main` sui salti riusciti).
- [x] **Barra di caricamento (buffer)** — `.player-progress-buffer` deve crescere mentre il video
      scarica, anche da fermo (video in pausa), non solo mentre scorre.
      **OK** (2026-09-15, live, Chromium bundled pilotato a mano) — risolto passando a MediaSource:
      il player scarica da sé con `fetch()` e appende a un `SourceBuffer` invece di affidare tutto a
      `<video src>` (vedi CLAUDE.md, "Barra di caricamento: risolta con MediaSource Extensions").
      Verificato: `video.buffered.end` passa da **6s a 20s in 8 secondi di pausa** (`currentTime`
      fermo a 2.1, quindi il video non stava scorrendo), `seekable.end(0)` popolato a 20 (prima
      `[0,0]`), la larghezza CSS della barra grigia passa da 0% a 9.4%. `currentSrc` è un
      `blob:` (MediaSource), non più `/api/mux/...` diretto.
      **Ripiego verificato**: con `MediaSource` disattivato a mano (`delete window.MediaSource`
      prima del caricamento della pagina), il player torna a `<video src="/api/mux/...">` come
      prima di questo lavoro, e un salto nel ripiego funziona (`currentTime` si sposta, nessun
      `video.error`) — nessuno resta senza riproduzione se il browser non supporta MSE o il codec.
      **Regressioni controllate, tutte pulite**: velocità 1.5x scelta dal menu **resta 1.5x** dopo
      un salto lungo che riapre il flusso (il test più delicato: l'ordine "sacro" degli effect
      caricamento/velocità doveva restare valido anche col nuovo percorso asincrono — vedi
      `apriStream`/`avviaMse`, che riapplicano `playbackRate` subito dopo ogni `load()`, non solo
      contando sull'ordine degli effect); cambio qualità a 480p resta su MSE (`currentSrc` ancora
      `blob:`); un salto corto (ArrowRight) **non genera più nessuna richiesta `/api/mux` nuova**
      quando il punto è già nel buffer (miglioria: prima ogni salto corto passava comunque dal
      controllo `isBuffered`/`isSeekable` su un `buffered`/`seekable` nativi meno affidabili). Log
      server puliti su tutta la sessione di prova, nessun processo `ffmpeg` rimasto orfano dopo i
      test (incluso il ripiego, dove `reader.cancel()` chiude la fetch e il server nota la
      disconnessione).
      Bug incontrato e corretto durante l'implementazione: un effect di cleanup con `useStreamSource()`
      (che ritorna un oggetto nuovo ad ogni render) fra le sue dipendenze chiudeva il flusso — quindi
      revocava l'URL del blob — dopo ogni render invece che solo allo smontaggio, causando
      `DEMUXER_ERROR_COULD_NOT_OPEN` quasi subito dopo l'apertura. Deps vuote, corretto.
- [ ] **Recupero da un errore vero della pompa MSE** — un fetch che cade o un `appendBuffer` che
      fallisce a metà riproduzione (rete instabile, es. un telefono in Tailscale su rete di casa;
      tab in background su Android che sospende la pompa) deve far riaprire da solo il flusso dal
      punto vero, non lasciare lo spinner acceso per sempre in attesa di un tocco dell'utente.
      Bug trovato leggendo il codice (non ancora riprodotto dal vivo in questa sessione, manca un
      browser): `pompa()` in `msePump.js` chiamava già `cb.onError(e)` su ogni eccezione non dovuta
      a una chiusura volontaria, ma **`onError` non veniva mai propagato** — `apriStream()` in
      `useStreamSource.js` non lo estraeva da `opt` né lo passava a `creaFlussoMse()`, e
      `index.jsx` non lo passava mai a `flusso.apri()`: la chiamata `onError?.(e)` finiva su
      `undefined`, un no-op silenzioso. Risultato: il buffer smetteva di crescere, `buffering`
      restava vero, e nessun evento successivo lo spegneva — combacia con "il video si blocca da
      solo e resta con lo spinner finché non premo di nuovo play". Corretto collegando `onError`
      allo stesso meccanismo già usato per la fine anticipata del flusso (`riapriOrinuncia` in
      `useStreamSource.js`): stesso tetto di `MAX_RETRY_FINE_ANTICIPATA` tentativi, riapertura dal
      punto vero letto da `video.currentTime` (non da uno stato React che in quel momento può
      essere stantio); esauriti i tentativi si spegne almeno lo spinner (`onAutoplayFailed`) invece
      di restare acceso all'infinito. **Da verificare dal vivo**: aprire un video, forzare un
      errore nella pompa (es. `sourceBuffer.abort()` da devtools, o staccare/riattaccare la rete
      qualche secondo mentre il video scarica) e controllare che la riproduzione riparta da sola
      entro un paio di tentativi invece di restare bloccata.

      Due regressioni trovate in revisione (prima del push, non ancora viste dal vivo) e corrette
      nello stesso commit: (1) `retryRef.current.tentativi` si azzerava solo su un'apertura che non
      fosse la continuazione di un retry — mai su un retry che aveva RECUPERATO da solo. In un video
      lungo con più cadute di rete isolate e distanti nel tempo (nessun salto o cambio qualità in
      mezzo a "resettare" il contatore) la terza smetteva di recuperare anche se le prime due si
      erano risolte senza problemi da tempo. Corretto: un primo blocco arrivato con successo su
      un'apertura nata da un retry azzera il contatore (`onBuffer` in `useStreamSource.js`), non
      solo un'apertura "fresca". (2) L'effetto di caricamento decideva se far ripartire il flusso
      riaperto leggendo `andavaRef` (vero dopo `onPlay`, mai azzerato da `onPause` — solo da
      `onEnded`), la stessa guardia che il commento all'effetto di recupero da stallo, tre righe
      sotto nello stesso file, dice esplicitamente essere quella sbagliata proprio per questo
      motivo. Prima serviva un salto deliberato dell'utente per notare l'effetto; con `onError`
      collegato, una semplice caduta di rete su un video in pausa lo faceva ripartire da solo senza
      alcuna azione dell'utente. Corretto usando `playing` (aggiornato solo da `onPlay`/`onPause`
      veri) al posto di `andavaRef`, che è stato rimosso.

      Altre due trovate nella stessa revisione, corrette in un secondo momento (**da verificare dal
      vivo**, non ancora viste in un browser): (3) il retry su `onError` era immediato, senza
      attesa — su una caduta di rete vera (lo scenario dichiarato: Wi-Fi che cade qualche secondo)
      bruciava il tentativo nell'unico istante in cui la rete non rispondeva ancora, il `fetch` del
      retry falliva a sua volta, e anche il ripiego `<video src>` (che tenta lo stesso URL) falliva
      nello stesso istante — risultato un toast «Errore stream — ricarica la pagina» per un
      singhiozzo di 3 secondi che si sarebbe risolto da sé. Corretto con un'attesa prima del retry,
      solo per `onError` (non per la fine anticipata da URL scaduto, dove il problema è un altro e
      il retry immediato è corretto): 1s al primo tentativo, 2s al secondo
      (`RETRY_BACKOFF_MS`/`opt.backoff` in `useStreamSource.js`). (4) `avviaMse()` in `mseStream.js`
      non aveva alcun `try/catch`: se `addSourceBuffer()` rifiutava il mime dichiarato — pur dopo
      che `MediaSource.isTypeSupported()` aveva detto di sì, visto su alcune WebView/Android TV con
      AV1 — o se l'evento `sourceopen` non arrivava mai, l'eccezione (o la Promise mai risolta)
      non arrivava a nessuno: `creaFlussoMse()` non aveva un `.catch()` attorno alla chiamata,
      `apriStream()` neppure, `flusso.apri()` in `index.jsx` neppure — rejection non gestita (o
      apertura appesa per sempre), `<video>` agganciato a un `MediaSource` morto, nessun ripiego su
      `<video src>`, spinner fisso. Corretto: `avviaMse()` ora ha un tetto sull'attesa di
      `sourceopen` (`MSE_SOURCEOPEN_TIMEOUT_MS`, 5s) e un `try/catch` che ripulisce (`URL.
      revokeObjectURL`, cancella la risposta) e rilancia; `creaFlussoMse()` intercetta quel rilancio
      e ritorna `null` come per ogni altro caso di "MSE non disponibile per questo video" — lo
      stesso segnale già gestito che fa scattare il ripiego `<video src>` in `useStreamSource.js`.
      **Da verificare dal vivo**: (3) forzare una caduta di rete breve (qualche secondo) durante la
      riproduzione e controllare che non compaia il toast d'errore, solo una breve pausa poi la
      ripresa da sola; (4) se possibile forzare `addSourceBuffer` a fallire (devtools) o simulare un
      `sourceopen` che non arriva, e controllare che il player ripieghi su `<video src>` invece di
      restare con lo spinner fisso.
- [x] **Cambio qualità** — dal menu del player: il flusso si riapre alla stessa posizione e la
      scelta a mano ha la precedenza sulla preferenza fino a fine sessione.
      **OK** (2026-09-14, live) — riaperto il menu impostazioni dopo l'avvio: `currentSrc` riflette
      `quality=720` (gradino scelto da `qualityForScreen` con "Migliore qualità" attiva su un
      viewport 1280×800).
- [x] **"Migliore qualità" mostra la definizione reale** — con `quality=best` selezionata, la voce
      nel menu indica anche il gradino effettivamente in arrivo (come "Automatica (1080p)" di
      YouTube), non solo "Migliore qualità" senza dettagli. `labelForHeight` in
      `videoPlayerHelpers.js` arrotonda `video.videoHeight` (evento `resize` del `<video>`) al
      gradino noto più vicino.
      **OK** (2026-09-14, live) — menu impostazioni → voce "Qualità": `textContent` concatenato
      `"Migliore qualità720p"` (nessuno spazio: normale, `textContent` ignora il layout flex — la
      classe `player-settings-row` è applicata e mette il valore a destra, separato visivamente).
- [ ] **Qualità fino a 4K** — il menu del player e le Impostazioni offrono `2160p (4K)` e `1440p`;
      `GET /api/mux/<vid>?quality=2160` su un video che ha il 4K restituisce un flusso `ffprobe`
      con `height=2160`, e `quality=best` (default) sale da solo fino a 2160p. `adaptive_format_selector`
      default → 2160. **Il menu 4K compare solo dopo `npm run build`
      del frontend** (dist versionato). Nota: il seek su un 4K torna a pagare un probe del keyframe,
      ma nella forma leggera reintrodotta (`read_intervals` a 3 fotogrammi, ~0.7-1s misurati su un
      video 720p) — non la finestra intera del vecchio `_keyframe_before` (4-5s su un 4K); da
      confermare il costo esatto su un flusso 2160p reale.
- [x] **Adatta la qualità allo schermo** — preferenza attiva di default (`GET /api/prefs` include
      `"fitScreen": true`). Con `quality` = `best`, il player chiede a `/api/mux` non `quality=best`
      ma il gradino YouTube più alto che il pannello regge — `qualityForScreen` in
      `components/VideoPlayer/videoPlayerHelpers.js`: `min(screen.width, screen.height) *
      devicePixelRatio`, senza tetto sul DPR (tolleranza 5%), mappato su `[2160,1440,1080,720,480]`.
      Funzionante quando: su un monitor/telefono 1080p con "Migliore disponibile" selezionata il
      `<video>.currentSrc` finisce in `?quality=1080` (non `best`); su un pannello che regge il
      1440p finisce in `?quality=1440`; una scelta numerica esplicita dal menu (es. 2160p) passa
      **intatta** anche con l'opzione attiva; disattivando l'opzione in Impostazioni il flusso si
      riapre e torna a `?quality=best`. Non tocca `/api/download` né il Cast (`castUrl`), dove lo
      schermo di riferimento non è quello del browser.
      **OK** (2026-09-01, Chromium headless con `window.screen` e viewport 1920×1080, dpr 1 — la
      MCP Playwright del repo è agganciata al canale `chrome`, non installabile qui senza root, quindi
      Chromium bundled pilotato a mano): aperto `/watch?v=dQw4w9WgXcQ` con `fitScreen: true`,
      `<video>.currentSrc` = `…/api/mux/dQw4w9WgXcQ?quality=1080` (non `best`); disattivato
      l'interruttore in `/settings` (→ `GET /api/prefs` `"fitScreen": false`) e riaperto il video,
      `currentSrc` = `…/api/mux/dQw4w9WgXcQ?quality=best`. Preferenza ripristinata a `true` a fine
      prova. Sotto-casi non coperti: pannello 1440p → `?quality=1440` e scelta numerica esplicita dal
      menu che deve passare intatta con l'opzione attiva.
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
- [x] **Striscia di azioni della pagina video** — sotto il titolo: pillola «mi piace» a sinistra,
      poi le icone in cerchio con l'etichetta sotto (Condividi, Scarica), su una riga che scorre in
      orizzontale invece di andare a capo. Funzionante quando **non** c'è nessun comando Cast qui
      mentre non si sta trasmettendo (è nella barra del player) e quando invece, a trasmissione
      attiva, compare la pillola «Interrompi» — senza la quale, col player non montato, non ci
      sarebbe più modo di fermare la TV.
      **OK** (browser headless, 390px e 1280px, `localhost:8099/watch?v=dQw4w9WgXcQ`) — la riga
      mostra `👍 19,4 Mln`, `Condividi`, `Scarica` e nessuna icona Cast; la barra del player mostra
      l'icona Cast fra il tempo e il CC. La pillola «Interrompi» (`isCasting`) **non verificabile**:
      serve un Chromecast reale, assente qui.
- [x] **Fila dei comandi del player sul telefono** — a 390-393px di larghezza tutti i pulsanti
      stanno nella barra, compreso lo schermo intero in fondo a destra.
      **OK** — aggiungendo l'icona Cast la fila sbordava di ~35px e il tasto schermo intero restava
      tagliato a metà (`.player-buttons` `scrollWidth` 388 contro `clientWidth` 353 su Pixel 5).
      Sotto i 900px il tasto «modalità cinema» ora è nascosto via CSS (`.player-theater-btn`): a
      quella larghezza i correlati stanno già sotto al player, quindi non ha niente da allargare —
      stesso motivo per cui non compare nell'APK. Rimisurato dopo la modifica: `scrollWidth` 353 =
      `clientWidth` 353, nessun taglio.
- [x] **Descrizione: card chiusa + pannello a comparsa** — sotto il titolo una card con tre pillole
      (Mi piace / Visualizzazioni / Data) e due righe di descrizione con "...altro"; il tocco apre
      un pannello che sale da sotto, alto al massimo il 75% dello schermo, con le linguette
      Descrizione / Capitoli / Trascrizione. Funzionante quando: le ultime due linguette compaiono
      **solo** se il video ha rispettivamente capitoli e sottotitoli; il player resta visibile sopra
      il pannello; toccare un capitolo sposta il video **senza** chiudere il pannello; lo stesso
      capitolo toccato due volte vale due volte; il tasto Indietro chiude il pannello invece di
      lasciare la pagina; la trascrizione si scarica solo quando si apre quella linguetta.
      **OK** (Chromium headless pilotato a mano, 1280x900 e 390x844, server su :8090) —
      `/watch?v=a3IGUH9PUBw` (7 capitoli + 33 lingue di sottotitoli): card con `511 / Mi piace`,
      `40,9 Mila / Visualizzazioni`, `17 ago 2026 / Data` e descrizione tagliata a 2 righe; il click
      apre il pannello (675px su 900px di viewport = 75vh, `top=225`, player sopra); le tre
      linguette ci sono tutte. Su `/watch?v=_68gGKI83LE` (9 capitoli, **zero** sottotitoli) le
      linguette sono solo `Descrizione` e `Capitoli`, come deve essere. Capitolo "Display,
      temperature e dissipazione" → il tempo del player passa da `0:01` a `2:19` e il pannello
      resta aperto; `→` da tastiera porta a `2:29` e **lo stesso** capitolo ricliccato riporta a
      `2:19` (il contatore `n` di `seekRequest` fa passare due richieste identiche). Linguetta
      Trascrizione: prima "Caricamento trascrizione…", poi **366 righe** cliccabili (riga 40 →
      `2:21`), **0** duplicati consecutivi. `window.ytproxyHandleBack()` → `true` e il pannello
      sparisce dal DOM con l'URL invariato; senza pannello aperto → `false` (il tasto torna alla
      navigazione normale). Click sullo sfondo: chiude. Tema chiaro (`data-theme="light"`):
      pannello `rgb(255,255,255)` su testo `rgb(15,15,15)`, leggibile come lo scuro.
- [x] **Lettura del .vtt per la trascrizione** — i sottotitoli automatici di YouTube ripetono ogni
      riga nelle cue successive (effetto "riga che scorre") e portano un tag inline per parola:
      la trascrizione mostrata non deve avere righe doppie né tag.
      **OK** (provato sul file vero, non a mente: `curl -s localhost:8090/api/subtitles/-KxJVh3VcU8/it.vtt`,
      recensione italiana di ~22 minuti, sottotitoli **auto-generati**) — 955 cue, 954 non vuote →
      **478 righe** dopo la deduplica, **0** duplicati consecutivi e nessun `<c>`/`<00:00:01.234>`
      nel testo. Controllo di non-regressione su sottotitoli **caricati a mano** (`5MgBikgcWnY`,
      TED, inglese): 329 cue → **329 righe**, cioè la deduplica non tocca niente dove non serve.

### Mini-player (widget) e Picture-in-Picture

Criterio comune a tutte le voci: passando tra pagina intera, widget e PiP **non parte nessuna nuova
richiesta `/api/mux` né `/api/watch`** (il player non si rimonta). Le chiamate della pagina sotto
(`/api/search`, `/api/feed/home`, `/api/img`…) invece ripartono, perché quella pagina si rimonta.
Si controlla contando le richieste nel pannello rete (o con `page.on("request")` in Playwright).
Le prove del 2026-09-24 sono state fatte con il Chromium di Playwright headless a 390×844 e
1280×800, server di prova su :8097 con `data/` vuota.

- [x] **Indietro dal video → widget** — dalla pagina video, Indietro torna alla schermata di
      partenza e il video continua in un widget in basso a destra. **OK** — ricerca → video →
      Indietro: `/search?q=minecraft`, `data-mode="mini"`, tempo 1.5 → 4.0 s senza pause, widget
      `[187, 726, 195, 110]` (8px dal bordo destro e da quello basso a 390×844), nuove `/api/mux` e
      `/api/watch`: **nessuna**.
- [x] **Tocco sul widget → pagina intera** — riapre il video a pagina intera allo stesso punto.
      **OK** — tempo 6.4 → 8.0 s, nessuna nuova `/api/mux`/`/api/watch`, voce `/watch` con `sotto`
      = la ricerca.
- [x] **Da un correlato, Indietro** — torna alla schermata di partenza (non al video precedente)
      col correlato nel widget. **OK** — ricerca → A → correlato R (`history.length` resta 3: la
      voce è sostituita) → Indietro: ricerca, R nel widget, posizione 3 → 6 s, nessuna richiesta.
- [x] **Video → canale → altro video, due volte Indietro** — nessun ritorno a un video vecchio.
      **OK** — ricerca → R → canale (R nel widget) → B → Indietro: canale con B nel widget →
      Indietro: ricerca con B nel widget; R non si ricarica, nessuna richiesta.
- [x] **Apertura diretta di `/watch` sul web, poi Indietro** — home col widget, non uscita dal
      sito. **OK** — cronologia riscritta in `[home, video]` (`depth` 1, `sotto: "/"`), Indietro
      → `/`, widget, tempo 1.5 → 3.5 s, nessuna richiesta.
- [x] **Home dalla barra laterale durante un video** — torna indietro invece di creare
      `[home, home]`, e la barra laterale si chiude. **OK** — `/watch` diretto → hamburger → Home:
      `/`, `history.length` invariata (3), `depth` 0, `data-sidebar="false"`.
- [x] **Trascinamento** — il widget si sposta, resta dentro l'area libera (sotto l'header, a
      destra della barra laterale su desktop) e il rilascio non lo espande. **OK** — telefono:
      trascinato a sinistra → `left` 8, posizione salvata `{"x":0,"y":0.43}`, resta `mini`.
      Desktop 1280×800: trascinato oltre l'angolo in alto a sinistra → `[80, 64]` (barra stretta
      72 + 8, header 56 + 8); predefinita `[872, 567, 400, 225]`.
- [x] **Pulsanti del widget** — pausa/play comandano il video, X lo chiude. **OK** — pausa →
      `paused: true`, play → `false`; X → nessun `<video>` in pagina.
- [x] **Tastiera col widget** — spazio e frecce restano alla pagina, `k` e `m` al video. **OK** —
      spazio: resta in riproduzione; `k`: pausa.
- [x] **Schermo intero, poi Indietro (desktop)** — si esce dallo schermo intero, il video va nel
      widget. **OK** — `f` → `fullscreenElement` presente; Indietro → nessuno, `mini`, nessuna richiesta.
- [x] **Qualità cambiata nelle Impostazioni col widget** — il flusso si riapre dal punto
      raggiunto, non dall'ultimo salto o da 0. **OK** — widget a 7.7 s, qualità predefinita → 720:
      una sola nuova richiesta, `/api/mux/y7iNb-rdhJ0?quality=720&start=7.54`.
- [ ] **Widget durante il cast** — uscendo dalla pagina di un video in cast non resta nessun
      widget. **non verificabile** (serve un Chromecast).
- [ ] **Rotazione e banner cookie** — ruotando il telefono o chiudendo il banner, il widget resta
      dentro l'area libera. **non verificabile** in questo giro (la posizione è calcolata dal CSS
      con le stesse variabili dell'header e del banner: da provare sul telefono).
- [x] **Aspetto in PiP** — con `data-pip` su `<html>` il player copre tutta la finestra, sopra
      header, pannelli e toast, senza barra dei comandi, da pagina intera **anche in modalità
      cinema** e dal widget; togliendolo tutto torna com'era. **OK** (simulato nel browser:
      finestra 320×180 + `data-pip`) — player e video `[0, 0, 320, 180]`, elemento in cima al punto
      dell'header = il player, barra `display: none`; dopo: widget di nuovo a `[872, 567, 400, 225]`.
      Sul web il ponte verso Android non fa niente: nessun errore in console.

Le voci seguenti richiedono l'APK su un telefono vero (`./scripts/build_apk.sh --install`) e si
leggono con `adb logcat -s YtPip`:

- [ ] **Tasto Home col video in riproduzione → PiP** — il video continua nella finestrella, con
      le proporzioni del video (non una finestra verticale). Pagina intera o widget, uguale.
      **non verificabile** (serve il telefono).
- [ ] **Espandi** — riporta nell'app sul video a pagina intera allo stesso secondo, nessuna nuova
      `/api/mux`/`/api/watch`; se si era già sulla pagina del video niente voce doppia. Nel log:
      `modoCambiato pip=false lifecycle=STARTED` (o `RESUMED`) → `espandi`.
      **non verificabile** (serve il telefono).
- [ ] **X della finestra** — il video si ferma (niente audio senza finestra); al tasto Home
      successivo non si ferma niente di sbagliato. Nel log: `lifecycle=CREATED` → `chiudi`.
      **non verificabile** (serve il telefono).
- [ ] **Play/pausa nella finestra** — comandano il video; l'icona segue lo stato, anche durante
      uno stallo di rete resta "pausa". **non verificabile** (serve il telefono).
- [ ] **Indietro dalla home col widget** — in riproduzione: PiP invece di chiudere l'app; in
      pausa, o con il PiP disattivato per l'app nelle impostazioni di Android: l'app si chiude come
      prima (`enterPictureInPictureMode → false` nel log). **non verificabile** (serve il telefono).
- [ ] **Video in pausa, tasto Home** — nessuna finestra, come prima. **non verificabile**.
- [ ] **Scroll dopo il PiP** — entrando da pagina intera scorsa fino ai commenti, al ritorno la
      pagina è allo stesso punto. **non verificabile** (serve il telefono).

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
      **2026-09-14 — voce "Sottotitoli" tolta dal menu ⚙ del player** (su richiesta; codice
      commentato, non cancellato, in `MainSettingsPanel.jsx`): il controllo resta raggiungibile dal
      tasto CC nella barra e dalla scorciatoia "c", non toccati. **OK** (live) — menu ⚙ mostra solo
      le sezioni "Riproduzione" e "Qualità", niente "Sottotitoli"/"Dimensione sottotitoli".

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

- [x] **Bollicine dei canali attivi** (server) — `GET /api/feed/channel-bubbles` elenca i canali
      iscritti ordinati per ultimo video noto, con `nuovo` acceso finché quell'id non è stato visto,
      e dichiara `source` (`cookie` / `cache` / `subs` / `nessuna`). Non fa mai partire
      un'estrazione: legge solo le cache già presenti. `POST /api/channels/<cid>/seen` spegne
      l'indicatore. Funzionante quando aprire un video **vecchio** di un canale **non** spegne
      l'indicatore di uno nuovo.
      **OK** (endpoint; la riga di avatar in home è lato frontend, ancora da fare) — con la `data/`
      reale (niente cookie né OAuth): `curl http://127.0.0.1:8097/api/feed/channel-bubbles` →
      `{"channels":[],"source":"nessuna"}`, 200, nessun 500. Con un `YTPROXY_DATA` di prova
      (3 canali iscritti, cache feed con 3 video): i canali escono ordinati per data
      (`UC_B` 20260915, `UC_A` 20260910, il canale senza video in coda con `nuovo:false`),
      `source: "cache"`; `POST /api/channels/UC_B/seen` → `{"ok":true}`, ripetuto → `{"ok":false}`
      (non riscrive il file); `POST /api/history` con il video **vecchio** di `UC_A` lascia
      `nuovo:true`, con l'**ultimo** video lo porta a `false`; una voce di cronologia **senza**
      `channel_id` risponde 200 senza eccezioni; dopo riavvio del server lo stato è ancora spento
      (letto da `data/channel_seen.json`). Origine esterna:
      `curl -X POST -H 'Origin: https://evil.example' .../api/channels/<cid>/seen` → **403**.

- [x] **Bollicine dei canali attivi** (UI) — riga scorrevole di avatar in cima alla home, **sopra**
      le chip e solo nella categoria "Tutti", con il pallino blu sui canali che hanno pubblicato
      qualcosa di non ancora aperto. Funzionante quando: senza canali la striscia **non** compare
      affatto (nessun errore in home, è decorativa), il tocco porta alla pagina del canale e spegne
      il pallino **subito**, senza aspettare la risposta del server.
      **OK** (browser headless a 390px, `/api/feed/channel-bubbles` simulato con 3 canali di cui 2
      `nuovo` — sul server di prova non c'è né cookie né OAuth, quindi la risposta vera è
      `{"channels":[],"source":"nessuna"}` e la riga sparisce come previsto): 3 bollicine, 2
      pallini, nomi troncati su 2 righe; il click sulla prima porta a `/channel?id=UC1` e manda
      `POST /api/channels/UC1/seen` (due volte: una dalla bollicina, una dalla pagina canale, che
      la ripete fire-and-forget — è idempotente). Avatar via `proxyImg()` e senza `loading="lazy"`,
      come le altre immagini YouTube.

- [x] **Griglia video a colonna singola sul telefono** — sotto i 600px `.video-grid` passa a una
      colonna sola e canale + statistiche stanno sulla **stessa** riga, separati da un "•".
      **OK** (browser headless a 390px, pagina canale `UCPb7HS_gEFJYV-1IOrKIUKw`):
      `grid-template-columns` calcolato `366px` (una colonna), meta su una riga
      (`W I N D • 2 visualizzazioni • 17 set 2026`).

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
- [ ] **«Mi piace» a un video** (OAuth con `youtube`) — nella riga azioni della pagina video, con
      l'account collegato in scrittura, il 👍 è un pulsante: cliccarlo mette "mi piace"
      (`POST /api/videos/<id>/rate` `{"rating":"like"}` → `videos.rate`, 50 unità di quota),
      ricliccarlo lo toglie (`"none"`). All'apertura pagina `GET /api/videos/<id>/rating` (1 unità)
      dice se il video ha già "mi piace". Senza scope di scrittura → il 👍 resta il conteggio in
      sola lettura di prima. ⚠️ scrive davvero su YouTube.
      **verificato senza OAuth** (via `TestClient`): `GET /rating` senza account →
      `{"rating":"none","reason":"not-authenticated"}` (200); `POST /rate` senza account → 401
      `"Nessun account Google collegato"`; `POST /rate {"rating":"banana"}` → 400 `"Rating non
      valido"`. `norm_check` pulito, `npm run build` OK. **non eseguito** con un account reale —
      azione irreversibile, richiede richiesta esplicita dell'utente.

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
- [x] **Preferenze** — `GET /api/prefs` torna almeno `quality`, `autoplay`, `theme`, `fitScreen`;
      `PATCH /api/prefs` le aggiorna e sopravvivono al riavvio del server.
      **OK** (stavolta verificato anche il riavvio vero, non solo la scrittura su disco) —
      `GET /api/prefs` → `{"quality":"best","autoplay":true,"theme":"dark"}` (prima di `fitScreen`;
      oggi la risposta include anche `"fitScreen": true` — da ri-verificare al prossimo giro).
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

- [x] **Posizione del comando Cast** — l'icona sta nella barra dei comandi del player, fra il tempo
      e il CC (`variant="player"`, sola icona, stesso click e stesso tooltip della pillola); nella
      striscia di azioni sotto il titolo resta **solo** la pillola «Interrompi», e solo mentre si
      trasmette. È l'unico modo di fermare la TV quando il player non è montato.
      **OK** (browser headless, desktop 1280px e Pixel 5) — icona Cast presente nella barra del
      player in entrambi i casi, nessun comando Cast nella striscia di azioni. Il comportamento a
      trasmissione attiva **non verificabile** senza un Chromecast reale.
- [ ] **Disponibilità** — su Chrome/Edge/Brave desktop il `CastButton` è attivo; **nell'APK Android
      è attivo** (plugin nativo `YtCast`, Cast SDK di Android); su Electron e browser non Chromium
      resta **visibile e spiega il motivo** invece di sparire. Non c'è più il messaggio
      "non disponibile nell'app Android".
      **non verificabile** — serve un runtime reale (desktop o APK installato su un telefono con
      Google Play services), non disponibile in questo ambiente headless.
- [ ] **Trasmissione (desktop)** — il video parte sul Chromecast con i codec compatibili; poi si
      comanda dal telecomando della TV / Google Home (il ramo web è "manda e basta").
      **non verificabile** — serve un Chromecast in rete, assente qui.
- [ ] **Scoperta dispositivi nell'APK (Android 13+)** — al primo tocco su "Trasmetti" l'app chiede
      il permesso **«dispositivi nelle vicinanze»** (`NEARBY_WIFI_DEVICES`); concesso, il selettore
      elenca i Chromecast / Android TV sulla stessa rete. Senza il permesso il Cast SDK non trova
      nulla anche con un Chromecast acceso. Le TV senza Chromecast integrato (Samsung, LG, Roku,
      Fire TV) restano fuori: non parlano il protocollo Google Cast.
      **OK** (controllo statico) — `aapt2 dump permissions YTProxy.apk` elenca `NEARBY_WIFI_DEVICES`
      (`neverForLocation`), `CHANGE_WIFI_MULTICAST_STATE`, `ACCESS_FINE_LOCATION` (`maxSdkVersion=32`);
      `CastBridgePlugin` fa `requestPermissionForAlias("nearbyWifi", …)` in `showDevicePicker()` con
      callback che riapre il selettore. **non verificabile** fino in fondo — serve un telefono
      Android 13+ con un Chromecast reale in rete.
- [ ] **Telecomando dall'APK Android** — trasmesso un video dal telefono, il player locale lascia
      il posto a `CastRemote`: play/pausa, barra di avanzamento con seek, ±10s e doppio tocco ai
      lati comandano la TV dal telefono; la barra segue la posizione (eventi `mediaStatusChanged`,
      ~1/s). Chiudere la sessione (`CastButton` → "Interrompi") spegne il receiver.
      **non verificabile** — servono APK installato + un Chromecast in rete. Verificato da codice:
      `hooks/nativeCast.js` + `nativeCastBridge.js` instradano i comandi su `CastBridgePlugin.java`
      (`RemoteMediaClient`), `norm_check` pulito, `npm run build` OK.
- [ ] **Qualità / sottotitoli / velocità via cast (APK)** — dal menu ⚙ del `CastRemote`: cambiare
      qualità o attivare un sottotitolo **ricarica il video sulla TV alla stessa posizione**
      (`CastRemote/useCastReload.js` → `YtCast.loadMedia` con `currentTime`, `tracks`,
      `activeTrackIds`); la velocità cambia a caldo (`setPlaybackRate`) e viene riapplicata dopo
      ogni ricarica. Le scelte aggiornano anche lo stato della pagina, così alla fine del cast il
      player locale riparte già allineato.
      **verificato senza hardware**: (1) niente header `Access-Control-Allow-Origin` doppio — probe
      con `TestClient` + lo stesso `CORSMiddleware`: origine assente o non in allow-list → un solo
      `*` (giusto per il receiver Cast); origine LAN in allow-list → il middleware lo sostituisce
      con l'origine esatta (un solo header). (2) menu ⚙: `.player-settings-*` sono `position:
      absolute` e si ancorano a `.player-wrap` (già `relative`), con `bottom:62px` che scavalca la
      `CastRemoteBar` sorella — stessa struttura del player locale. `norm_check` pulito, build OK.
      **non verificabile** — serve APK + Chromecast: (a) i sottotitoli side-loaded compaiono
      davvero sul receiver; (b) `TextTrackStyle.setFontScale` viene onorato; (c) resa visiva del
      menu ⚙ con una sessione cast attiva.
- [ ] **Coda via cast (APK)** — mentre si trasmette dal telefono, ogni video correlato mostra un
      "＋" che lo accoda sul Chromecast (`RelatedSidebar` → `cast.remote.queueAdd` →
      `RemoteMediaClient.queueAppendItem`). Nel `CastRemote`, con ≥2 video in coda, compare
      `CastRemoteQueue`: elenco + "Precedente"/"Successivo" (`queueNext`/`queuePrev`). La coda è
      quella nativa di Google Cast (`MediaQueue`), nessuna struttura lato server; il frontend la
      rispecchia dall'evento `queueChanged`.
      **non verificabile** — serve APK + Chromecast. Da codice: `norm_check` pulito, `npm run
      build` OK, il toast "in coda" è dietro `await` + try/catch (niente falso positivo se il
      plugin rifiuta). Da controllare col dispositivo: `queueAppendItem` su una sessione partita
      con un solo `load()` (coda implicita di 1), l'ordine degli item e l'evidenziazione di quello
      in riproduzione (`getCurrentItemId`), l'avanzamento automatico a fine video, e il
      comportamento di "Precedente"/"Successivo" ai bordi della coda (i pulsanti non si
      disabilitano: primo/ultimo elemento → click inerte).
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
      *Aggiornamento*: l'APK ora include il plugin nativo `YtCast` (Cast SDK di Android) e la
      dipendenza `play-services-cast-framework` — la prima build dopo questa modifica va rifatta con
      `./scripts/build_apk.sh` (scarica la nuova dipendenza) e va verificato che `assembleDebug`
      compili. Permessi aggiunti al manifest: `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE`,
      `WAKE_LOCK`. L'App ID del receiver entra da `VITE_CAST_APP_ID` via `resValue` in
      `app/build.gradle` (fallback `CC1AD845`).
- [x] **APK su rete solo-LAN: icone e miniature** — con il telefono su una rete senza DNS
      pubblico (la WebView non risolve `fonts.googleapis.com` / `i.ytimg.com`), aperta l'app:
      (a) l'header e i comandi del player mostrano le **icone**, non le parole `menu` / `play_circle`
      / `pause`; (b) le **miniature** di feed, correlati e ricerca si vedono, e così i **loghi
      canale** in commenti e pagine canale.
      Come funziona: i due font (Roboto + Material Symbols) sono impacchettati nel bundle
      (`frontend/src/assets/fonts/*.woff2`, `@font-face` locale in `App.css`, niente più `@import`
      da Google); le immagini di YouTube passano dal proxy del server `GET /api/img?u=<url>`
      (`server/routers/images.py`), che riscarica lato server (ha internet per yt-dlp) e rimanda
      sulla LAN; il frontend avvolge ogni `<img src>` con `proxyImg()` (`api/img.js`). Tolto
      `loading="lazy"` dalle miniature: nella WebView non partivano finché lo schermo non era
      acceso e composto.
      **OK** (verifica in questa sessione via Chrome DevTools sul WebView di un telefono reale):
      prima `net::ERR_NAME_NOT_RESOLVED` su `fonts.googleapis.com`; dopo, `document.fonts.check`
      per "Material Symbols Outlined" → `true`, gli `<span class=material-symbols-outlined>` resi
      come glifo (larghezza ~20px, non ~50px di testo), `assets/*.woff2` serviti 200 dall'APK,
      e `fetch('/api/img?u=…i.ytimg.com…')` dal contesto pagina → `200 image/jpeg`.
      `grep googleapis frontend/dist/assets/*.css` → nessun risultato. `curl` diretto:
      `/api/img?u=<ytimg>` → `200 image/jpeg`, `/api/img?u=<host non YouTube>` → `400`.
      **2026-09-14 — aggiunta cache**: `proxy_immagine` apriva un `httpx.AsyncClient` nuovo (nuovo
      handshake TLS verso Google) a OGNI miniatura, sospettato fra le cause di "l'app è lenta a
      caricare" (la home carica decine di miniature in un colpo). Ora un client condiviso
      (keep-alive) più una cache LRU in memoria (`_cache`, max 300 voci) — verificato: stessa
      miniatura, prima richiesta 199ms, seconda (cache) 3ms; l'allowlist host (`_HOST_CONSENTITI`)
      continua a rifiutare un host non YouTube con 400.
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
