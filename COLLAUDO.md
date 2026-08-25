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

- [ ] **Il server parte** — `GET /api/health` risponde 200 con JSON. Funzionante quando parte anche
      **senza cookie e senza OAuth**, e `/tmp/ytproxy_collaudo.log` non contiene traceback.
- [ ] **Rotte SPA** — `/watch`, `/search`, `/subscriptions`, `/settings`, `/channel`, `/history`
      rispondono **200 con l'HTML dell'app**, non 404. È il controllo che scopre una pagina aggiunta
      senza la route in `spa_routes()`.
- [ ] **Cache dei file statici** — `index.html` torna `Cache-Control: no-cache, must-revalidate`,
      un file sotto `/assets/` torna `immutable`. Senza questo la UI resta indietro di una build.
- [ ] **`/api/lan-address`** — risponde con un indirizzo. Funzionante quando è un IP raggiungibile
      dalla LAN; dentro Docker in bridge torna l'IP del container ed è atteso (vedi CLAUDE.md).

## 2. Ricerca

- [ ] **`GET /api/search?q=...`** — funzionante quando restituisce una lista non vuota di video con
      id, titolo, canale e durata, e la pagina 2 (`page=2`) dà risultati **diversi** dalla 1.
- [ ] **Suggerimenti** — `GET /api/suggestions?q=...` restituisce una lista di stringhe attinenti.
- [ ] **Pagina Ricerca** — la UI mostra i risultati e lo scroll infinito carica la pagina successiva.

## 3. Riproduzione — è il cuore del progetto

- [ ] **Metadati** — `GET /api/watch/<vid>` torna titolo, canale, durata, descrizione, qualità
      disponibili. Funzionante quando **non** contiene URL di stream (li risolve `/api/mux`).
- [ ] **Flusso video** — `GET /api/mux/<vid>?quality=720` restituisce byte MP4 in streaming
      (`curl -m 15 ... -o /tmp/p.mp4` produce un file non vuoto che `ffprobe` legge come frammentato).
- [ ] **Il video parte nella UI** — si apre, si vede e si sente, senza errori in console.
- [ ] **Seek lungo** — spostare la barra a metà video: riparte da lì e il tempo mostrato è
      `start + currentTime`, cioè il punto chiesto, **non zero**.
- [ ] **Seek corto** — tasti ← → e doppio tocco su telefono: il video si sposta di pochi secondi e
      **non torna all'inizio**. È la trappola di `seekable` vuoto: qui si vede o non si vede.
- [ ] **Cambio qualità** — dal menu del player: il flusso si riapre alla stessa posizione e la
      scelta a mano ha la precedenza sulla preferenza fino a fine sessione.
- [ ] **Velocità di riproduzione** — "Riproduzione veloce" dal menu e 2x tenendo premuto:
      funzionante quando la velocità **resta** dopo un salto (che riapre il flusso e chiama `load()`).
- [ ] **Autoplay** — con la preferenza attiva un video appena aperto parte da solo; funzionante
      quando spostare la barra di un video **in pausa** non lo fa ripartire.
- [ ] **Schermo intero** — su desktop copre lo schermo; su APK Android copre anche barra di stato
      e barra di navigazione (`FullscreenWebChromeClient`).

## 4. Download e sottotitoli

- [ ] **`GET /api/download/<vid>`** — funzionante quando risponde con `Content-Disposition:
      attachment`, produce un file che si apre in un lettore comune (codec compatibili, non AV1+Opus)
      e **non lascia niente su disco** nella cache del server.
- [ ] **Elenco sottotitoli** — `GET /api/subtitles/<vid>` elenca le lingue disponibili.
- [ ] **Traccia** — `GET /api/subtitles/<vid>/<lang>.vtt` restituisce un WebVTT valido e i
      sottotitoli compaiono sul video nella UI.

## 5. Feed

- [ ] **Home con cookie** — `GET /api/feed/home?limit=24` restituisce video e `source: "cookies"`.
- [ ] **Home senza cookie** — restituisce lista vuota e un `reason` fra `no-cookies`,
      `not-logged-in`, `feed-vuoto`, e la home lo **spiega a schermo**. Funzionante quando **non**
      mostra contenuti presi da altrove fingendo che siano la tua home.
- [ ] **Home, scroll lungo** — scorrendo oltre il primo blocco arrivano video nuovi; oltre l'esaurirsi
      della continuazione il feed si riapre e **non ripete** gli id già serviti (`LazyFeed._rigenera`).
- [ ] **Correlati** — `GET /api/related/<vid>` restituisce video e dichiara `source`: `mix` per un
      video normale, `ricerca` per un video poco visto o di canale piccolo, `nessuna` come ultimo caso.
      Funzionante quando lo scroll della sidebar continua a caricare.
- [ ] **Feed iscrizioni** — `GET /api/feed/subscriptions` restituisce video e `source`
      (`cookies` / `local`). Con cookie assenti resta la cache su disco aggiornata da `sync.py`.

## 6. Canale e iscrizioni

- [ ] **Pagina canale** — `GET /api/channel/<cid>/videos` restituisce i video **e** l'intestazione
      in `channel` (nome, logo, copertina, iscritti). Funzionante quando le card hanno il nome canale
      riempito e lo scroll pagina.
- [ ] **Elenco iscrizioni** (OAuth) — `GET /api/subscriptions` elenca i canali con logo.
- [ ] **Stato iscrizione** — `GET /api/subscriptions/status/<cid>` risponde **senza consumare quota**
      (lo legge da `data/subscriptions.json`, non da YouTube).
- [ ] **Iscriversi / disiscriversi** (OAuth con `youtube`) — il pulsante cambia stato e
      resta cambiato dopo un ricaricamento. Con un token vecchio senza quello scope: **403
      `insufficientPermissions` spiegato all'utente**, non un errore muto. ⚠️ modifica il tuo account
      reale: provalo solo se l'utente lo chiede, e su un canale che sceglie lui.
- [ ] **Sincronizzazione** — `POST /api/subscriptions/sync` aggiorna l'elenco. Funzionante quando una
      scansione interrotta a metà **non** sostituisce il file locale.
- [ ] **Pagina Iscrizioni** — le due metà (elenco da OAuth, feed da cookie) funzionano ognuna da sola;
      la pagina si dichiara vuota solo se mancano entrambe, e la scheda "Canali" c'è solo con l'OAuth.

## 7. Commenti

- [ ] **Lettura** — `GET /api/comments/<vid>` restituisce commenti con autore, testo e `source`
      (`api` o `ytdlp`). Funzionante **anche senza OAuth** (via yt-dlp).
- [ ] **Risposte** — `GET /api/comments/<vid>/replies` restituisce le risposte a un commento.
- [ ] **Commenti disattivati** — un video con i commenti chiusi produce un messaggio chiaro, non un errore.
- [ ] **Pubblicazione** (OAuth con `youtube`) — il commento compare. Senza lo scope: 403
      spiegato. ⚠️ scrive davvero su YouTube: solo su richiesta esplicita dell'utente.

## 8. Cronologia e preferenze

- [ ] **Registrazione** — aprire un video lo aggiunge a `GET /api/history` con titolo e istante.
- [ ] **Pagina Cronologia** — mostra le voci; cancellare una voce (`DELETE /api/history/<vid>`) e
      svuotare tutto (`DELETE /api/history`) si riflettono subito nella UI. ⚠️ tocca dati reali.
- [ ] **Preferenze** — `GET /api/prefs` torna almeno `quality`, `autoplay`, `theme`;
      `PATCH /api/prefs` le aggiorna e sopravvivono al riavvio del server.
- [ ] **Tema** — cambiando tema l'attributo `data-theme` su `<html>` cambia, la palette segue in
      tutta l'app, e **il player resta scuro in entrambi i temi**.

## 9. Autenticazioni (entrambe facoltative)

- [ ] **Stato cookie** — `GET /api/auth/status` espone `logged_in`. Funzionante quando un
      `cookies.txt` con cookie di prima parte su `youtube.com` dà `logged_in: true`, e un file di soli
      cookie `google.com` dà `false` invece di far finta di essere loggati.
- [ ] **Caricamento cookie** — `POST /api/cookies/upload` accetta il file e i feed si popolano.
- [ ] **Import dal browser** — `GET /api/cookies/browsers` elenca i browser trovati (compresi i
      percorsi snap su Linux) e `POST /api/cookies/import?browser=...` importa.
- [ ] **Cancellazione cookie** — `DELETE /api/cookies` rimuove il file e lo stato torna a
      non-loggato. ⚠️ distrugge la sessione reale: solo su richiesta esplicita.
- [ ] **Sessione non invalidata** — dopo una sessione d'uso normale, i feed continuano a funzionare:
      è il controllo che scopre un `yt_dlp.YoutubeDL()` diretto al posto di `crea_ydl()`.
- [ ] **OAuth device flow** — `POST /api/auth/device/start` restituisce codice e URL,
      `POST /api/auth/device/poll` completa dopo l'inserimento su `google.com/device`. Funzionante
      quando **non c'è nessun redirect** e la procedura riesce con server e browser su macchine diverse
      (è il caso reale: server headless sul Raspberry Pi).
- [ ] **`GET /api/auth/me`** — restituisce l'account collegato; `POST /api/auth/logout` lo scollega.
- [ ] **Capacità dichiarate** — `/api/auth/status` espone `can_comment` / `can_subscribe` coerenti con
      lo scope del token, e la UI li usa per non offrire azioni che finirebbero in 403.

## 10. Sicurezza

- [ ] **Scritture da origine ostile bloccate** — attesi **403**:
      `curl -s -o /dev/null -w '%{http_code}\n' -X DELETE -H 'Origin: https://evil.example.com' localhost:8097/api/history`
- [ ] **Scritture da origine locale ammesse** — atteso **200**:
      `curl -s -X PATCH -H 'Origin: http://localhost:8097' -H 'Content-Type: application/json' -d '{"theme":"dark"}' localhost:8097/api/prefs`
- [ ] **Origin assente = permesso** — la stessa `PATCH` senza header `Origin` (curl nudo, app nativa)
      passa: è voluto, non una svista.
- [ ] **Le GET restano aperte** — `/api/mux/<vid>` risponde anche senza `Origin`: serve al Chromecast,
      che scarica il video da sé.
- [ ] **Endpoint di scrittura nuovi protetti da soli** — un `POST`/`DELETE` aggiunto di recente
      risponde 403 da origine ostile senza che nessuno gli abbia messo un decoratore.
- [ ] **Permessi delle credenziali** — `ls -l data/oauth_token.json data/oauth_setup.json data/cookies.txt`
      mostra `-rw-------` (0600), **anche dopo** un'estrazione che ha riscritto `cookies.txt`.
- [ ] **Niente segreti nel repo** — `git status` non mostra file di `data/` da committare e il diff
      non contiene token, cookie o client secret.

## 11. Cast

- [ ] **Disponibilità** — su Chrome/Edge/Brave desktop il `CastButton` è attivo; altrove è **visibile
      e spiega il motivo** invece di sparire.
- [ ] **Trasmissione** — il video parte sul Chromecast con i codec compatibili e i comandi di base
      rispondono. Non verificabile senza un Chromecast in rete.

## 12. Piattaforme e confezionamento

- [ ] **Build frontend allineata** — `cd frontend && npm run build` non dà errori e `git status`
      mostra `frontend/dist/` aggiornato e committato insieme al sorgente.
- [ ] **`./start_server.sh`** — installa le dipendenze, aggiorna yt-dlp e arriva a servire su :8090.
- [ ] **Electron** — `npm start` apre la finestra, avvia da sé il server Python e l'app funziona.
- [ ] **APK Android** — `./build_apk.sh` produce `YTProxy.apk`; installato, l'onboarding accetta
      l'IP del server e l'app carica i contenuti. Funzionante quando `capacitor.config.json` tiene
      `server.androidScheme: "http"`: con `https` le chiamate al server sono contenuto misto e la
      WebView le blocca in silenzio (sintomo: dal browser del telefono il server si apre, dall'app no).
- [ ] **Docker** — `docker compose up -d --build` avvia il server, `./data` sull'host resta popolato
      e sopravvive a `docker compose down`.
- [ ] **Porta 8090 allineata** — `main.py`, `frontend/vite.config.js`, `electron/main.js`,
      `start_server.sh`/`.bat`, `Dockerfile`, `docker-compose.yml` dicono tutti la stessa cosa.

---

## Ultimo collaudo

_Da aggiornare a ogni passaggio completo: data, commit, esiti (OK / KO / non verificabili) e cosa resta._

- **Data:** mai eseguito
- **Commit:** —
- **Esito:** —
