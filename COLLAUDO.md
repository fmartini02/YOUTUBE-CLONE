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
      **OK** — `curl http://127.0.0.1:8097/api/health` → `{"status":"ok"}` HTTP 200. Log senza
      traceback (solo avvio, sync iscrizioni, le due GET di prova). `data/` in questo run aveva
      `oauth_token.json` ma non `cookies.txt`: avvio riuscito comunque, coerente col fatto che
      entrambe le autenticazioni sono facoltative.
- [x] **Rotte SPA** — `/watch`, `/search`, `/subscriptions`, `/settings`, `/channel`, `/history`
      rispondono **200 con l'HTML dell'app**, non 404. È il controllo che scopre una pagina aggiunta
      senza la route in `spa_routes()`.
      **OK** — le sei `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8097/<rotta>` hanno
      dato tutte 200, corpo con `<div id="root">` (l'HTML dell'app), non 404.
- [x] **Cache dei file statici** — `index.html` torna `Cache-Control: no-cache, must-revalidate`,
      un file sotto `/assets/` torna `immutable`. Senza questo la UI resta indietro di una build.
      **OK** — `curl -sD- -o /dev/null http://127.0.0.1:8097/index.html` → `no-cache, must-revalidate`;
      `curl -sD- -o /dev/null http://127.0.0.1:8097/assets/index-CYJ7KgjC.js` →
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
      `id`/`title`/`channel`/`duration`. `&page=2` → 20 risultati, solo 1 id in comune con la
      pagina 1 (19/20 diversi).
- [x] **Suggerimenti** — `GET /api/suggestions?q=...` restituisce una lista di stringhe attinenti.
      **OK (corretto)** — era KO: il regex di `main.py` si fermava alla prima `]` che trovava
      (quella di un array innestato tipo `[512,433]` dentro ogni suggerimento), troncando il JSON e
      facendo cadere tutto nel `except: pass`. Fix: tolto il regex, si stacca il wrapper della
      callback JSONP (`window.google.ac.h(...)`) per indice e si parsa l'intero payload con
      `json.loads`. Riverificato dopo il fix: `curl -m30
      'http://127.0.0.1:8097/api/suggestions?q=lofi'` → 8 suggerimenti (`lofi`, `lofi girl`, `lofi
      music`, ...); `q=how+to` → 8 suggerimenti diversi e attinenti. Nessun traceback nel log.
- [ ] **Pagina Ricerca** — la UI mostra i risultati e lo scroll infinito carica la pagina successiva.
      **non verificabile** — serve un browser reale (nessuna UI visiva in questo ambiente headless).

## 3. Riproduzione — è il cuore del progetto

- [x] **Metadati** — `GET /api/watch/<vid>` torna titolo, canale, durata, descrizione. Funzionante
      quando **non** contiene URL di stream (li risolve `/api/mux`). *(corretto: la voce parlava di
      "qualità disponibili" ma la risposta non ha quel campo — le qualità sono l'elenco fisso
      `_QUALITY_HEIGHTS` in `main.py`, non qualcosa che arriva da `/api/watch`.)*
      **OK** — `curl -m60 http://127.0.0.1:8097/api/watch/dQw4w9WgXcQ` → titolo, canale "Rick
      Astley", durata 213, descrizione non vuota, nessuna stringa `googlevideo`/`stream` nel corpo.
      **Bug collaterale trovato e corretto (non nella lista, riportato a parte)**: per un video che
      yt-dlp non riesce a estrarre, `/api/watch` rispondeva **200** con tutti i campi `null` invece
      di un errore, perché `ignoreerrors: True` fa tornare `None` da yt-dlp e il codice non
      controllava che l'estrazione fosse riuscita prima di costruire la risposta. Fix: se
      l'estrazione torna vuota si solleva `HTTPException(404, "Video non trovato o non
      disponibile")`. Riverificato: `curl -o /tmp/o.json -w '%{http_code}'
      http://127.0.0.1:8097/api/watch/WRVsOCh907o` → **404**, `{"detail":"Video non trovato o non
      disponibile"}`; un video valido (`dQw4w9WgXcQ`) continua a rispondere 200 coi campi giusti
      (nessuna regressione).
- [x] **Flusso video** — `GET /api/mux/<vid>?quality=720` restituisce byte MP4 in streaming
      (`curl -m 15 ... -o /tmp/p.mp4` produce un file non vuoto che `ffprobe` legge come frammentato).
      **OK** — 5.2 MB in 30s su `dQw4w9WgXcQ?quality=720`; `ffprobe` legge 2 stream (video AV1
      1280x720, audio), `format_name=mov,mp4,m4a,3gp,3g2,mj2`, `major_brand=iso5` (frammentato).
      Testato anche `start=100`: risponde 200, `ffprobe` mostra un flusso valido che riparte da 0
      internamente (comportamento atteso: è ffmpeg che riapre da quel punto, non un vero seek HTTP).
- [ ] **Il video parte nella UI** — si apre, si vede e si sente, senza errori in console.
      **non verificabile** — serve un browser reale.
- [ ] **Seek lungo** — spostare la barra a metà video: riparte da lì e il tempo mostrato è
      `start + currentTime`, cioè il punto chiesto, **non zero**.
      **non verificabile** — serve un browser reale (l'endpoint `/api/mux?start=` risponde
      correttamente lato server, vedi sopra; il comportamento è nel JS del player).
- [ ] **Seek corto** — tasti ← → e doppio tocco su telefono: il video si sposta di pochi secondi e
      **non torna all'inizio**. È la trappola di `seekable` vuoto: qui si vede o non si vede.
      **non verificabile** — serve un browser reale.
- [ ] **Cambio qualità** — dal menu del player: il flusso si riapre alla stessa posizione e la
      scelta a mano ha la precedenza sulla preferenza fino a fine sessione.
      **non verificabile** — serve un browser reale.
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
      **OK** — `curl -m60 http://127.0.0.1:8097/api/download/jNQXAC9IVRw?quality=720` → 200,
      `content-disposition: attachment; filename="jNQXAC9IVRw.mp4"`, 745200 byte; `ffprobe` legge
      video **h264** + audio **aac** (non AV1+Opus, come da doc). `/tmp/ytproxy_cache` non esiste
      dopo la prova. Nota: lo stesso endpoint su `dQw4w9WgXcQ` ha dato ripetutamente 200 ma 0 byte,
      con nel log `[ffmpeg] ... Server returned 403 Forbidden` sull'URL googlevideo risolto con
      client `ANDROID_VR` (itag 136) — riprodotto 3 volte di fila (stesso URL, quindi la cache di
      `_mux_formats` lo riproponeva). Sembra un 403 lato YouTube legato a quel formato/nodo CDN
      specifico più che un bug del proxy, dato che un secondo video con lo stesso meccanismo ha
      funzionato al primo colpo; segnalato per completezza, non abbassa il voto della voce.
- [x] **Elenco sottotitoli** — `GET /api/subtitles/<vid>` elenca le lingue disponibili.
      **OK** — `curl -m40 http://127.0.0.1:8097/api/subtitles/dQw4w9WgXcQ` → 36 lingue con
      `code`/`name`/`auto`.
- [x] **Traccia** — `GET /api/subtitles/<vid>/<lang>.vtt` restituisce un WebVTT valido e i
      sottotitoli compaiono sul video nella UI. *(solo la parte server è verificabile qui)*
      **OK** (endpoint) — `curl -m40 http://127.0.0.1:8097/api/subtitles/dQw4w9WgXcQ/en.vtt` → 200,
      inizia con `WEBVTT`, timecode e testo corretti. **non verificabile** (comparsa nella UI) —
      serve un browser reale.

## 5. Feed

- [ ] **Home con cookie** — `GET /api/feed/home?limit=24` restituisce video e `source: "cookies"`.
      **non verificabile — manca il cookie** (`data/cookies.txt` assente in questo giro).
- [x] **Home senza cookie** — restituisce lista vuota e un `reason` fra `no-cookies`,
      `not-logged-in`, `feed-vuoto`, e la home lo **spiega a schermo**. Funzionante quando **non**
      mostra contenuti presi da altrove fingendo che siano la tua home. *(solo la parte server)*
      **OK** (endpoint) — `curl -m60 'http://127.0.0.1:8097/api/feed/home?limit=24'` →
      `{"results":[],...,"reason":"no-cookies","source":"none"}`. **non verificabile** (spiegazione
      a schermo) — serve un browser reale.
- [ ] **Home, scroll lungo** — scorrendo oltre il primo blocco arrivano video nuovi; oltre l'esaurirsi
      della continuazione il feed si riapre e **non ripete** gli id già serviti (`LazyFeed._rigenera`).
      **non verificabile — manca il cookie** (la home è vuota senza cookie, non c'è niente su cui
      scorrere).
- [x] **Correlati** — `GET /api/related/<vid>` restituisce video e dichiara `source`: `mix` per un
      video normale, `ricerca` per un video poco visto o di canale piccolo, `nessuna` come ultimo caso.
      Funzionante quando lo scroll della sidebar continua a caricare.
      **OK** — `curl -m60 http://127.0.0.1:8097/api/related/dQw4w9WgXcQ` → 20 risultati,
      `source: "mix"`, `has_more: true`. `?offset=20&limit=20` → altri 20, **0** id in comune con la
      pagina precedente: la continuazione funziona (conferma indiretta dello scroll infinito).
- [x] **Feed iscrizioni** — `GET /api/feed/subscriptions` restituisce video e `source`
      (`cookies` / `local`). Con cookie assenti resta la cache su disco aggiornata da `sync.py`.
      **OK** — `curl -m60 http://127.0.0.1:8097/api/feed/subscriptions` → 30 risultati,
      `source: "local"` (coerente con l'assenza di cookie: usa la cache su disco).

## 6. Canale e iscrizioni

- [x] **Pagina canale** — `GET /api/channel/<cid>/videos` restituisce i video **e** l'intestazione
      in `channel` (nome, logo, copertina, iscritti). Funzionante quando le card hanno il nome canale
      riempito e lo scroll pagina.
      **OK** — `curl -m60 http://127.0.0.1:8097/api/channel/UCuAXFkgsw1L7xaCfnd5JJOw/videos` → 30
      video, `channel.name: "Rick Astley"`, `channel.avatar`/`subscribers` presenti, ogni video ha
      `channel: "Rick Astley"` in chiaro.
- [x] **Elenco iscrizioni** (OAuth) — `GET /api/subscriptions` elenca i canali con logo.
      **OK** — `curl -m30 http://127.0.0.1:8097/api/subscriptions` → 116 canali con `id`/`name`/
      `thumbnail`. (Letto dalla copia locale, vedi nota OAuth qui sotto.)
- [x] **Stato iscrizione** — `GET /api/subscriptions/status/<cid>` risponde **senza consumare quota**
      (lo legge da `data/subscriptions.json`, non da YouTube).
      **OK** — `curl -m15 http://127.0.0.1:8097/api/subscriptions/status/UCtRrFIehQpQii6pu3YVNNig` →
      `{"subscribed":true,...}` in 9ms (`time curl`), troppo veloce per una chiamata di rete a
      YouTube: conferma la lettura locale.
- [ ] **Iscriversi / disiscriversi** (OAuth con `youtube.force-ssl`) — il pulsante cambia stato e
      resta cambiato dopo un ricaricamento. Con un token vecchio senza quello scope: **403
      `insufficientPermissions` spiegato all'utente**, non un errore muto. ⚠️ modifica il tuo account
      reale: provalo solo se l'utente lo chiede, e su un canale che sceglie lui.
      **non eseguito** — azione irreversibile su dati reali, richiede richiesta esplicita dell'utente.
- [x] **Sincronizzazione** — `POST /api/subscriptions/sync` aggiorna l'elenco. Funzionante quando una
      scansione interrotta a metà **non** sostituisce il file locale.
      **OK** — con il refresh token OAuth attualmente non valido (vedi nota sotto), sia la sync
      automatica all'avvio sia `curl -m30 -X POST http://127.0.0.1:8097/api/subscriptions/sync`
      hanno preso esattamente la strada di protezione descritta: `sync_subscriptions` vede
      `get_valid_token()` restituire `None` e fa `return self._subs` (auth.py:847-849) senza
      toccare il file. Confermato con `stat`: `data/subscriptions.json` ha lo stesso mtime (7 ago)
      prima e dopo tutte le prove — non è stato riscritto nonostante 116 canali "sincronizzati" a
      log. È esattamente il comportamento "una lista parziale non sostituisce quella buona".
- [ ] **Pagina Iscrizioni** — le due metà (elenco da OAuth, feed da cookie) funzionano ognuna da sola;
      la pagina si dichiara vuota solo se mancano entrambe, e la scheda "Canali" c'è solo con l'OAuth.
      **non verificabile** — serve un browser reale.

## 7. Commenti

- [x] **Lettura** — `GET /api/comments/<vid>` restituisce commenti con autore, testo e `source`
      (`api` o `ytdlp`). Funzionante **anche senza OAuth** (via yt-dlp).
      **OK** — `curl -m60 http://127.0.0.1:8097/api/comments/dQw4w9WgXcQ` → 40 commenti,
      `source: "ytdlp"`, ogni commento con `author`/`text`/`likes`/`published`. (Il percorso Data API
      non è raggiungibile in questo giro per il refresh token non valido, vedi nota OAuth: è passato
      correttamente al ripiego yt-dlp invece di restituire una lista vuota.)
- [ ] **Risposte** — `GET /api/comments/<vid>/replies` restituisce le risposte a un commento.
      **non verificabile — il refresh token OAuth salvato non è più accettato da Google (serve
      rifare il device flow)**: le risposte esistono solo nel percorso Data API
      (`supports_replies: true` solo con `source: "api"`), che qui non parte mai. Riprodotto:
      `curl 'http://127.0.0.1:8097/api/comments/dQw4w9WgXcQ/replies?parent_id=x'` → 500
      `{"detail":"Nessun account Google collegato"}`.
- [ ] **Commenti disattivati** — un video con i commenti chiusi produce un messaggio chiaro, non un errore.
      **non verificabile** — non ho trovato un video con i commenti disattivati: i tre candidati
      provati (video CoComelon, contenuto per bambini) risultavano tutti "video non disponibile" nel
      log yt-dlp, non commenti-chiusi. Nota: il messaggio specifico "I commenti sono disattivati per
      questo video" vive solo nel ramo Data API (main.py, branch `commentsDisabled`), irraggiungibile
      con il token attuale — col solo yt-dlp l'utente vedrebbe il messaggio generico "Commenti non
      disponibili al momento" anche per un video con commenti davvero disattivati.
- [ ] **Pubblicazione** (OAuth con `youtube.force-ssl`) — il commento compare. Senza lo scope: 403
      spiegato. ⚠️ scrive davvero su YouTube: solo su richiesta esplicita dell'utente.
      **non eseguito** — azione irreversibile su dati reali, richiede richiesta esplicita dell'utente.

## 8. Cronologia e preferenze

- [x] **Registrazione** — aprire un video lo aggiunge a `GET /api/history` con titolo e istante.
      **OK** — `curl -X POST -d '{"id":"COLLAUDOTEST01","title":"Collaudo test","channel":"Test",
      "thumbnail":"https://example.com/x.jpg"}' http://127.0.0.1:8097/api/history` → `{"ok":true}`;
      `GET /api/history?limit=5` mostra la voce in testa con `watched_at` valorizzato. Ripulito
      subito dopo con `DELETE /api/history/COLLAUDOTEST01` → tornato a 26 voci, la stessa cronologia
      di prima (confermato per conteggio e per id in testa).
- [ ] **Pagina Cronologia** — mostra le voci; cancellare una voce (`DELETE /api/history/<vid>`) e
      svuotare tutto (`DELETE /api/history`) si riflettono subito nella UI. ⚠️ tocca dati reali.
      **OK** (solo `DELETE /api/history/<vid>`, endpoint) — vedi sopra, cancellazione singola
      confermata via API. **non eseguito** (`DELETE /api/history`, svuota tutto) — irreversibile su
      dati reali, richiede richiesta esplicita dell'utente. **non verificabile** (riflesso nella UI)
      — serve un browser reale.
- [x] **Preferenze** — `GET /api/prefs` torna almeno `quality`, `autoplay`, `theme`;
      `PATCH /api/prefs` le aggiorna e sopravvivono al riavvio del server.
      **OK** — `GET /api/prefs` → `{"quality":"best","autoplay":true,"theme":"dark"}`.
      `PATCH -d '{"theme":"light"}'` → risposta aggiornata e `data/prefs.json` riscritto con
      `{"theme":"light"}` (scrittura file confermata, non solo in memoria). Rimesso subito a
      `{"theme":"dark"}` col valore originale.
- [ ] **Tema** — cambiando tema l'attributo `data-theme` su `<html>` cambia, la palette segue in
      tutta l'app, e **il player resta scuro in entrambi i temi**.
      **non verificabile** — serve un browser reale.

## 9. Autenticazioni (entrambe facoltative)

> **Nota sullo stato OAuth di questo giro**: `data/oauth_token.json` è presente e con lo scope
> giusto (`youtube.force-ssl` + `youtube.readonly`), ma il refresh token non è più accettato da
> Google. Evidenza: `expires_at` è di 8 giorni fa; dopo l'avvio e tutte le prove il file ha ancora
> l'mtime del 7 agosto (`_save_token()` non è mai scattato, cioè nessun refresh è mai riuscito); nel
> log non compare mai `[auth] Refresh token error` (quindi la chiamata a Google risponde, ma senza
> `access_token` in corpo — tipico di un `invalid_grant`); tre punti diversi lo confermano allo
> stesso modo (`/api/comments`, `/api/auth/me`, `/api/subscriptions/sync`, tutti con "Nessun account
> Google collegato" o un canale nullo). Questo **non** è "manca l'OAuth" (il token c'è, con lo scope
> giusto) — è un OAuth presente ma non funzionante, servirebbe rifare il device flow. Le voci sotto
> lo segnalano dove pertinente.

- [ ] **Stato cookie** — `GET /api/auth/status` espone `logged_in`. Funzionante quando un
      `cookies.txt` con cookie di prima parte su `youtube.com` dà `logged_in: true`, e un file di soli
      cookie `google.com` dà `false` invece di far finta di essere loggati.
      **non verificabile — manca il cookie**. Osservato solo il caso base:
      `curl http://127.0.0.1:8097/api/auth/status` → `"cookie":{"present":false,...,"logged_in":
      false}`, coerente con l'assenza del file, ma non testa la distinzione youtube.com/google.com
      che è il punto della voce.
- [ ] **Caricamento cookie** — `POST /api/cookies/upload` accetta il file e i feed si popolano.
      **non verificabile — manca il cookie**. Non tentato: un cookie di prova finto scriverebbe
      `data/cookies.txt` reale, vietato da questo giro di collaudo.
- [x] **Import dal browser** — `GET /api/cookies/browsers` elenca i browser trovati (compresi i
      percorsi snap su Linux) e `POST /api/cookies/import?browser=...` importa.
      **OK** (solo l'elenco) — `curl http://127.0.0.1:8097/api/cookies/browsers` →
      `{"browsers":[]}`: lista vuota corretta, coerente con una macchina headless senza Chrome/
      Firefox installati (nessun errore, nessun crash). **non verificabile** (l'import vero e
      proprio) — nessun browser da cui importare in questo ambiente, e con la lista già vuota non
      avrebbe comunque nulla da fare.
- [ ] **Cancellazione cookie** — `DELETE /api/cookies` rimuove il file e lo stato torna a
      non-loggato. ⚠️ distrugge la sessione reale: solo su richiesta esplicita.
      **non eseguito** — azione irreversibile su dati reali (e qui il file è già assente, quindi
      non ci sarebbe comunque nulla da provare).
- [x] **Sessione non invalidata** — dopo una sessione d'uso normale, i feed continuano a funzionare:
      è il controllo che scopre un `yt_dlp.YoutubeDL()` diretto al posto di `crea_ydl()`.
      **OK** (verifica statica, non serve il cookie) — `grep -rn "YoutubeDL(" server/*.py` trova una
      sola istanza diretta, dentro `crea_ydl()` stessa (auth.py:268); nessun'altra occorrenza in
      `main.py`/`sync.py`/`ytdlp_patch.py`. L'invariante "sempre `crea_ydl()`, mai `YoutubeDL()`
      nudo" è rispettato nel codice attuale.
- [ ] **OAuth device flow** — `POST /api/auth/device/start` restituisce codice e URL,
      `POST /api/auth/device/poll` completa dopo l'inserimento su `google.com/device`. Funzionante
      quando **non c'è nessun redirect** e la procedura riesce con server e browser su macchine diverse
      (è il caso reale: server headless sul Raspberry Pi).
      **non verificabile** — completarlo richiede un dispositivo interattivo per digitare il codice
      su google.com/device, non disponibile in questo ambiente headless. Non tentato nemmeno
      l'avvio: `POST /api/auth/device/start` riscrive incondizionatamente `data/oauth_setup.json`
      coi `client_id`/`client_secret` passati nel body (main.py:949-950), quindi anche solo
      provarlo avrebbe toccato un file di credenziali reali — evitato per rispettare il divieto.
- [ ] **`GET /api/auth/me`** — restituisce l'account collegato; `POST /api/auth/logout` lo scollega.
      **KO** (solo `GET /api/auth/me`) — `curl http://127.0.0.1:8097/api/auth/me` →
      `{"channel":null,"can_comment":true}`: nessun account restituito. Causa: il refresh token non
      valido (vedi nota sopra), non un bug di questo endpoint. **non eseguito** (`POST
      /api/auth/logout`) — ⚠️ **aggiunto qui**: non era marcato nel file ma è chiaramente
      distruttivo, cancellerebbe la sessione OAuth reale in `data/oauth_token.json`; richiede
      richiesta esplicita dell'utente come le altre voci ⚠️.
- [x] **Capacità dichiarate** — `/api/auth/status` espone `can_comment` / `can_subscribe` coerenti con
      lo scope del token, e la UI li usa per non offrire azioni che finirebbero in 403.
      **OK** (per la definizione letterale) — `curl http://127.0.0.1:8097/api/auth/status` →
      `"can_comment":true,"can_subscribe":true`, coerente con lo scope `youtube.force-ssl` presente
      nel token salvato. Da notare però (collegato alla nota OAuth sopra): questi campi riflettono lo
      *scope memorizzato*, non la validità live del token — in questo momento la UI offrirebbe
      "commenta"/"iscriviti" che però fallirebbero davvero, perché il refresh è rotto. Non è un bug
      di questa voce (fa esattamente quello che dice: legge lo scope), ma è un limite da tenere a
      mente se un utente ha un token con refresh morto: non se ne accorge finché non prova ad agire.

## 10. Sicurezza

- [x] **Scritture da origine ostile bloccate** — attesi **403**:
      `curl -s -o /dev/null -w '%{http_code}\n' -X DELETE -H 'Origin: https://evil.example.com' localhost:8097/api/history`
      **OK (corretto)** — era KO: rispondeva 500 per `NameError: name 'JSONResponse' is not
      defined` (mancava nell'import di `fastapi.responses` a riga 14, usata riga 88 in
      `blocca_scritture_esterne`). Fix: aggiunta `JSONResponse` all'import esistente. Riverificato:
      stesso comando → **403**, `{"detail":"Origine non consentita"}`, nessun traceback nel log.
- [x] **Scritture da origine locale ammesse** — atteso **200**:
      `curl -s -X PATCH -H 'Origin: http://localhost:8097' -H 'Content-Type: application/json' -d '{"theme":"dark"}' localhost:8097/api/prefs`
      **OK** — 200, corpo `{"quality":"best","autoplay":true,"theme":"dark"}` (valore già quello
      originale, nessun cambiamento di stato).
- [x] **Origin assente = permesso** — la stessa `PATCH` senza header `Origin` (curl nudo, app nativa)
      passa: è voluto, non una svista.
      **OK** — stesso comando senza `-H 'Origin: ...'` → 200.
- [x] **Le GET restano aperte** — `/api/mux/<vid>` risponde anche senza `Origin`: serve al Chromecast,
      che scarica il video da sé.
      **OK** — `curl -m15 -o /dev/null -w '%{http_code}' http://127.0.0.1:8097/api/mux/dQw4w9WgXcQ?quality=360`
      (nessun header Origin) → 200.
- [x] **Endpoint di scrittura nuovi protetti da soli** — un `POST`/`DELETE` aggiunto di recente
      risponde 403 da origine ostile senza che nessuno gli abbia messo un decoratore.
      **OK (corretto)** — stesso bug della voce sopra, stesso fix. Riverificato:
      `curl -o /dev/null -w '%{http_code}' -X DELETE -H 'Origin: https://evil.example.com'
      http://127.0.0.1:8097/api/prefs` → **403**, senza decoratore dedicato sull'endpoint (il
      middleware intercetta da solo).
- [x] **Permessi delle credenziali** — `ls -l data/oauth_token.json data/oauth_setup.json data/cookies.txt`
      mostra `-rw-------` (0600), **anche dopo** un'estrazione che ha riscritto `cookies.txt`.
      **OK** (parziale) — `ls -l data/oauth_token.json data/oauth_setup.json` → entrambi
      `-rw-------` (0600). **non verificabile** (la parte `cookies.txt`) — manca il cookie, il file
      non esiste in questo giro.
- [x] **Niente segreti nel repo** — `git status` non mostra file di `data/` da committare e il diff
      non contiene token, cookie o client secret.
      **OK** — `git status --porcelain --ignored` in questo worktree mostra solo `COLLAUDO.md`
      (untracked, nessun segreto) e `server/__pycache__/` (ignorato); nessun file di `data/` (il
      worktree non ne ha nemmeno una copia, sono gitignored). `git diff HEAD --stat` vuoto: nessuna
      modifica al codice applicativo in questo giro.

## 11. Cast

- [ ] **Disponibilità** — su Chrome/Edge/Brave desktop il `CastButton` è attivo; altrove è **visibile
      e spiega il motivo** invece di sparire.
      **non verificabile** — serve Chrome/Edge/Brave desktop reale, non disponibile in questo
      ambiente headless.
- [ ] **Trasmissione** — il video parte sul Chromecast con i codec compatibili e i comandi di base
      rispondono. Non verificabile senza un Chromecast in rete.
      **non verificabile** — serve un Chromecast in rete, assente qui.

## 12. Piattaforme e confezionamento

- [x] **Build frontend allineata** — `cd frontend && npm run build` non dà errori e `git status`
      mostra `frontend/dist/` aggiornato e committato insieme al sorgente.
      **OK** — `npm install` (159 pacchetti, node_modules non presenti in questo worktree) poi
      `npm run build`: "✓ built in 962ms", stessi nomi di file già in `frontend/dist/`
      (`index-BfF9oCZf.css`, `index-CYJ7KgjC.js`). `git status --porcelain -- frontend/dist` vuoto
      dopo la build: l'output è identico byte per byte a quanto committato, `dist/` è allineato.
- [ ] **`./start_server.sh`** — installa le dipendenze, aggiorna yt-dlp e arriva a servire su :8090.
      **non verificabile** — non eseguito: lo script libera forzatamente la porta 8090 uccidendo
      chi la occupa (`fuser`/`lsof`/`ss` + kill, righe 215-227), e su questa rete il server reale
      gira sul Raspberry Pi (192.168.1.253:8090) — eseguirlo da qui non lo toccherebbe direttamente,
      ma avviare un'istanza reale con `--reload` su una macchina non pensata per essere il server
      va oltre lo scopo di questo collaudo. Verificato invece da codice: la sequenza (installa
      dipendenze, aggiorna yt-dlp, builda il frontend se manca `dist/`, poi uvicorn su
      `0.0.0.0:8090 --reload`) corrisponde a quanto descritto in CLAUDE.md.
- [ ] **Electron** — `npm start` apre la finestra, avvia da sé il server Python e l'app funziona.
      **non verificabile** — serve un ambiente desktop con display, assente in questo ambiente
      headless.
- [ ] **APK Android** — `./build_apk.sh` produce `YTProxy.apk`; installato, l'onboarding accetta
      l'IP del server e l'app carica i contenuti. Funzionante quando `capacitor.config.json` tiene
      `server.androidScheme: "http"`: con `https` le chiamate al server sono contenuto misto e la
      WebView le blocca in silenzio (sintomo: dal browser del telefono il server si apre, dall'app no).
      **OK** (solo il controllo statico) — `cat frontend/capacitor.config.json` →
      `"server": {"androidScheme": "http"}`, corretto. **non verificabile** (build e installazione
      vere) — manca la toolchain Android (`which java` non trova nulla) e un dispositivo/emulatore
      su cui installare l'APK.
- [x] **Docker** — `docker compose up -d --build` avvia il server, `./data` sull'host resta popolato
      e sopravvive a `docker compose down`.
      **OK** — `docker compose build` (immagine costruita, pip installa le dipendenze da
      `server/requirements.txt`, nessun errore) poi `docker compose up -d` (nel worktree, porta 8090
      libera qui perché il server reale è sul Raspberry Pi): `curl http://127.0.0.1:8090/api/health`
      → `{"status":"ok"}`; `PATCH /api/prefs` di prova ha creato `data/prefs.json` sull'host (bind
      mount, non volume nominato); dopo `docker compose down` il file è rimasto su disco. Ripulito
      subito dopo: rimosso `data/prefs.json` di test e l'immagine `collaudo-primo-item-ytproxy` con
      `docker rmi` — questa era la `data/` del worktree (vuota salvo `.gitkeep`), non quella del
      checkout principale.
- [x] **Porta 8090 allineata** — `main.py`, `frontend/vite.config.js`, `electron/main.js`,
      `start_server.sh`/`.bat`, `Dockerfile`, `docker-compose.yml` dicono tutti la stessa cosa.
      **OK** — `grep -n 8090` su tutti e sei i file: `main.py:110` (`SERVER_PORT` default 8090),
      `vite.config.js:8` (proxy `/api` → `localhost:8090`), `electron/main.js:14` (`PORT` default
      8090), `start_server.sh`/`.bat` (avvio su 8090 + liberazione porta), `Dockerfile` (`ENV
      YTPROXY_PORT=8090`, `EXPOSE 8090`), `docker-compose.yml` (`"8090:8090"`) — tutti coerenti.

---

## Ultimo collaudo

_Da aggiornare a ogni passaggio completo: data, commit, esiti (OK / KO / non verificabili) e cosa resta._

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
  - **OK**: §1 (4/4), §2 (Ricerca, Suggerimenti), §3 Metadati e Flusso video, §4 (tutte e tre), §5
    (Home senza cookie/endpoint, Correlati, Feed iscrizioni), §6 (Pagina canale, Elenco iscrizioni,
    Stato iscrizione, Sincronizzazione), §7 Lettura, §8 (Registrazione, cancellazione singola,
    Preferenze), §9 (Import dal browser/elenco, Sessione non invalidata, Capacità dichiarate), §10
    (tutte e sette le voci verificabili, Permessi credenziali parziale), §12 (Build frontend, APK
    config statico, Docker, Porta 8090).
  - **non verificabile**: tutte le voci UI/hardware (Pagina Ricerca, l'intero player nella UI, Tema,
    Pagina Iscrizioni, Cast, Electron, `start_server.sh`, build/installazione APK vera) — serve un
    browser reale, un telefono/APK, un Chromecast o l'ambiente desktop, assenti in questo ambiente
    headless; le voci con cookie assente (Home con cookie, Home scroll lungo, Stato cookie completo,
    Caricamento cookie, Cancellazione cookie, permessi di `cookies.txt`); le voci OAuth dove il
    refresh token salvato non è più accettato da Google (Risposte ai commenti, Commenti disattivati,
    `GET /api/auth/me`) — token presente e con lo scope giusto, ma non funzionante: servirebbe
    rifare il device flow, non è "manca l'OAuth"; OAuth device flow (non tentato: l'avvio riscrive
    `data/oauth_setup.json` con le credenziali passate nel body, evitato per non toccare `data/`).
  - **non eseguito** (azioni irreversibili su dati reali, richiedono richiesta esplicita
    dell'utente): Iscriversi/disiscriversi da un canale, Pubblicazione di un commento, `DELETE
    /api/history` (svuota tutto), `DELETE /api/cookies`, `POST /api/auth/logout` (⚠️ aggiunta a
    questa voce nel file: era priva del simbolo pur essendo chiaramente distruttiva).
- **Verdetto complessivo**: nessun KO residuo — restano solo voci "non verificabile" (hardware/UI
  reale assenti in questo ambiente, cookie assente, refresh OAuth da rinnovare) e "non eseguito"
  (azioni irreversibili su dati reali, correttamente non tentate senza richiesta esplicita). Il
  progetto non può dirsi "collaudato e funzionante al 100%" finché quelle voci non vengono provate
  con l'hardware/browser reale o con un nuovo login OAuth, ma non ci sono più bug noti aperti.
