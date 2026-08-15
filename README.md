# YTProxy — YouTube senza pubblicità

Un'app che fa da intermediario tra te e YouTube: stessa UI, zero pubblicità.  
Funziona su **PC, telefono, Smart TV** — tutto dal browser.

---

## Come funziona

```
Il tuo PC (server)
├── FastAPI + yt-dlp  →  cerca, streamma e scarica i video
├── ffmpeg            →  unisce audio+video al volo (qualità piena)
└── Frontend React    →  UI identica a YouTube

Accesso da:
├── 💻 PC desktop    →  http://localhost:8090  (o app Electron)
├── 📱 Telefono      →  http://IP-PC:8090  (stessa WiFi, o app Android)
├── 📺 Smart TV      →  http://IP-PC:8090  (browser TV)
└── 📡 Chromecast    →  bottone "Trasmetti" da Chrome/Brave/Edge
```

Niente API key: i dati di YouTube arrivano tutti da yt-dlp. L'account Google e i
cookie sono **facoltativi** e servono solo per i feed personalizzati.

---

## Cosa c'è dentro

- Ricerca, autocomplete, video correlati
- Player integrato con **scelta della qualità** (fino a 1080p), commenti e sottotitoli
- **Home personalizzata** e **feed iscrizioni** reali (con i cookie del tuo account)
- Cronologia locale, preferenze (qualità predefinita, autoplay)
- **Chromecast** con receiver dedicato
- Download MP4
- App **desktop** (Electron) e **Android** (Capacitor)

---

## Installazione rapida

### Requisiti
- **Python 3.10+** → https://python.org
- **Node.js 18+** → https://nodejs.org
- **ffmpeg** → https://ffmpeg.org (per unire audio+video)

Lo script di avvio installa da solo quello che manca (Ubuntu/Debian, Fedora/RHEL,
Arch, openSUSE, macOS) e tiene aggiornato yt-dlp, che cambia spesso per stare
dietro a YouTube.

### macOS / Linux
```bash
# 1. Clona il progetto
git clone <repo> ytproxy && cd ytproxy

# 2. Avvia
chmod +x start_server.sh
./start_server.sh
```

### Windows
```
Doppio click su start_server.bat
```

### Installazione manuale
```bash
# Dipendenze Python
pip install -r server/requirements.txt

# Build frontend
cd frontend
npm install
npm run build
cd ..

# Avvia server
cd server
python -m uvicorn main:app --host 0.0.0.0 --port 8090
```

### Docker
Alternativa a `start_server.sh`: non serve installare Python/Node/ffmpeg
sull'host, solo Docker. yt-dlp si aggiorna da solo ad ogni riavvio del
container.
```bash
git clone <repo> ytproxy && cd ytproxy
docker compose up -d --build
```
I dati (cookie, login, iscrizioni, cronologia) restano in `./data` sul disco
dell'host, non dentro il container: sopravvivono a `docker compose down` e ai
rebuild dell'immagine. Per aggiornare dopo un `git pull`: `docker compose up -d --build`.

Per saltare l'aggiornamento di yt-dlp ad ogni riavvio del container (es. rete
lenta o assente all'avvio): `YTPROXY_SKIP_YTDLP_UPDATE=1` come `environment:`
nel `docker-compose.yml`.

---

## Accesso da telefono / Smart TV

1. Avvia il server sul PC con `start_server.sh`
2. Connetti telefono/TV alla **stessa WiFi** del PC
3. Apri il browser sul telefono/TV
4. Vai su `http://IP-DEL-PC:8090`

Per trovare l'IP del PC:
- **Windows**: `ipconfig` → "Indirizzo IPv4"
- **Mac/Linux**: `hostname -I` oppure `ip a`

> L'indirizzo sarà tipo `192.168.1.XX` — lo script di avvio te lo stampa già pronto.

### Accesso fuori casa (VPN Tailscale)

1. Installa [Tailscale](https://tailscale.com) su PC e telefono (gratis)
2. Avvia il server sul PC
3. Sul telefono usa l'IP Tailscale del PC invece di quello locale

---

## App desktop (Electron)

```bash
# Dalla root del progetto
npm install
npm run build:frontend
npm start                # avvia da sé anche il server Python

npm run build            # pacchetto installabile → dist-electron/
```

> Nell'app desktop il **Chromecast non è disponibile** (il componente Cast è
> proprietario di Google e non è incluso in Electron): per trasmettere apri
> `http://localhost:8090` in Chrome, Brave o Edge.

---

## App Android (Capacitor)

```bash
cd frontend
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug   # → app/build/outputs/apk/debug/
```

Al primo avvio l'app chiede l'**indirizzo del server** (es. `192.168.1.11:8090`):
il frontend è dentro l'APK, ma i video continuano ad arrivare dal PC. Se l'IP
del PC cambia, l'app se ne accorge e richiede l'indirizzo nuovo.

---

## Feed personalizzati (facoltativi)

Tutto funziona anche senza: senza cookie né account hai comunque ricerca,
video correlati e riproduzione. Si configurano da **⚙️ Impostazioni**.

### 🍪 Cookie YouTube → home e iscrizioni reali

Danno accesso alla vera homepage di YouTube (i tuoi suggerimenti) e al feed
iscrizioni reale. Due modi:

- **Import automatico**: se sul PC del server hai un browser già loggato su
  YouTube, l'app lo rileva e importa i cookie con un click (gestisce anche i
  browser installati via snap su Linux).
- **File**: esporta `cookies.txt` con l'estensione *Get cookies.txt* e caricalo.

I cookie scadono: dopo 2 settimane l'app mostra un avviso per rigenerarli.

#### Si configurano una volta sola, dal PC

I cookie vivono **sul server**, in un unico `data/cookies.txt`, e valgono per
tutti i client insieme: caricali una volta e home e iscrizioni personalizzate
compaiono anche sull'APK e sulla Smart TV, senza toccare nulla su quei
dispositivi. Su telefono e TV non c'è niente da configurare, e non è previsto
farci il login: il login di Google dentro una WebView è bloccato dalla policy
"secure browsers", e l'alternativa approvata (Chrome Custom Tabs) tiene i cookie
nel browser, dove l'app non può leggerli.

Quindi, con il **server su un'altra macchina** (secondo PC, Raspberry, NAS):

1. dal tuo PC apri `http://<ip-del-server>:8090` in un browser normale;
2. vai su ⚙️ **Impostazioni** → sezione *Cookie YouTube*;
3. apri una scheda su **youtube.com**, verifica di essere loggato ed esporta i
   cookie **di quel solo sito** con l'estensione;
4. trascina il `cookies.txt` nel riquadro. Il file viene caricato via HTTP,
   quindi funziona da qualsiasi macchina della rete.

In questo caso il pulsante di **import automatico non compare**, e non è un
guasto: quel controllo legge i profili dei browser installati sulla macchina
che *esegue* il server, non su quella da cui stai guardando la pagina. Stesso
sintomo se il server gira con un utente diverso dal tuo (servizio systemd,
`sudo`, container): home diversa, profili non trovati.

> ⚠️ Il `cookies.txt` **è una sessione già aperta**: chi ce l'ha entra come te
> senza password e senza 2FA, che non viene mai chiesto. Esportalo dal solo
> dominio `youtube.com`, cancellalo da `~/Downloads` dopo averlo caricato e non
> passarlo mai su chat o mail. Se ti scappa, revocalo da *account Google →
> Sicurezza → esci da tutti i dispositivi*. È già in `.gitignore`; su una
> macchina condivisa vale un `chmod 600 data/cookies.txt`.

Evita infine di tenere **due server accesi sugli stessi cookie**: YouTube ruota
i cookie di sessione ad ogni estrazione, e due copie che ruotano in parallelo
finiscono per invalidarsi a vicenda. Spegni il vecchio, o riesporta un file
nuovo per la macchina nuova.

### 🔑 Account Google → iscrizioni, loghi dei canali e commenti

Serve per la YouTube Data API v3: elenco canali iscritti, avatar, e i commenti
(paginazione completa, risposte ai thread e **pubblicazione** dei propri
commenti — senza account i commenti restano leggibili ma in sola lettura). Devi
creare un **Client ID OAuth gratuito** su
[console.cloud.google.com](https://console.cloud.google.com): progetto → API e
servizi → abilita *YouTube Data API v3* → Credenziali → ID client OAuth, di tipo
**"TV e dispositivi con input limitato"**.

Quel tipo di client **non chiede nessun URI di reindirizzamento**, ed è il
motivo per cui si usa: il login passa dal *device flow*, cioè un codice da
digitare invece di un rimando al browser. Il server chiede il codice, tu lo
digiti su `google.com/device` da un dispositivo qualsiasi, e il server intanto
aspetta e si collega da solo appena confermi.

1. incolla **Client ID** e **Client Secret** in ⚙️ Impostazioni e premi
   *Accedi con Google*;
2. compare un codice di poche cifre: aprilo su `google.com/device` **da questo
   o da qualsiasi altro dispositivo** — telefono compreso — e digitalo;
3. autorizza. La pagina delle Impostazioni si aggiorna da sola.

Da lì in poi le iscrizioni si risincronizzano da sole ogni ora.

> **Perché non il solito login con redirect.** Per gli URI `http://` Google
> accetta soltanto `localhost`/`127.0.0.1` e rifiuta gli indirizzi IP privati.
> Con il server su un'altra macchina della rete, quel redirect rimanderebbe il
> browser al `localhost` di *chi sta guardando*, dove non c'è nessun server: la
> schermata di consenso passa e subito dopo la pagina non carica, un sintomo che
> sembra una caduta di rete. Il device flow non ha redirect, quindi funziona
> identico su localhost, su IP di LAN e in headless — ed è l'unico che l'app
> usa: crea il Client ID come *TV e dispositivi con input limitato*, non come
> *Applicazione web*.

> Se avevi già collegato l'account prima di poter commentare, **rifai il login**
> dalle Impostazioni: il permesso di scrittura (`youtube.force-ssl`) va concesso
> di nuovo, altrimenti YouTube rifiuta la pubblicazione dei commenti.

---

## Chromecast

Il bottone **"Trasmetti sulla TV"** compare solo su **Chrome, Brave o Edge
desktop** (non in Electron, non su Firefox/Safari, non in Chromium
open-source). Serve inoltre che il server sia raggiungibile con l'IP di rete e
non da `localhost`: è la TV a scaricare il video, quindi `localhost` per lei
significherebbe sé stessa. In Impostazioni c'è una **diagnostica** che dice
quale requisito manca.

Al Chromecast lo stream viene servito in H.264+AAC (invece del meglio assoluto,
che oggi è AV1+Opus e la maggior parte dei dispositivi Cast non lo decodifica).

Facoltativo: registrando una *Custom Receiver App* su
[cast.google.com/publish](https://cast.google.com/publish) (5 € una tantum) la TV
mostra la schermata YTProxy — `http://IP-DEL-PC:8090/cast-receiver.html` — invece
di quella generica di Google. L'App ID si incolla in Impostazioni.

---

## Comportamento per dispositivo

| Dispositivo | Riproduzione | Download | Cast |
|---|---|---|---|
| Desktop (Chrome/Brave/Edge) | Player integrato | Scarica MP4 | ✅ |
| Desktop (altri browser) | Player integrato | Scarica MP4 | — |
| Desktop (Electron) | Player interno | Scarica MP4 | — |
| App Android / telefono | Player integrato | Apri con app scelta | — |
| iPhone/iPad | Player integrato | Apri con app scelta | — |
| Smart TV | Player integrato | — | — |

---

## Struttura progetto

```
ytproxy/
├── server/
│   ├── main.py          # FastAPI: endpoint + hosting del frontend
│   ├── auth.py          # OAuth Google, cookie, feed, cronologia, preferenze
│   ├── sync.py          # sync orario iscrizioni + cache feed
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx       # routing (History API)
│   │   ├── api.js        # chiamate API + rilevamento dispositivo
│   │   ├── components/   # Header, Sidebar, VideoCard, CastBar, ServerSetup…
│   │   ├── hooks/        # useCast, useInfiniteScroll, useToast…
│   │   └── pages/        # Home, Search, Video, Subscriptions, Settings
│   ├── public/cast-receiver.html
│   ├── dist/             # build servita dal server (versionata)
│   └── android/          # progetto Capacitor
├── electron/             # app desktop (avvia il server Python)
├── data/                 # cookie, token, cache, cronologia (non versionati)
├── start_server.sh       # Avvio Linux/Mac
├── start_server.bat      # Avvio Windows
├── Dockerfile            # Immagine del server (frontend copiato, non buildato)
├── docker-compose.yml    # Avvio con `docker compose up -d --build`
├── docker-entrypoint.sh  # Aggiorna yt-dlp poi avvia uvicorn
└── README.md
```

---

## API disponibili

| Endpoint | Descrizione |
|---|---|
| `GET /api/search?q=query&page=1` | Ricerca video |
| `GET /api/feed/home` | Home personalizzata (serve il cookie) |
| `GET /api/feed/subscriptions` | Feed iscrizioni |
| `GET /api/watch/{id}` | Metadati del video |
| `GET /api/mux/{id}?quality=1080` | **Stream del player**: audio+video uniti al volo |
| `GET /api/download/{id}?quality=720` | Scarica MP4 |
| `GET /api/comments/{id}?sort=top&page_token=` | Commenti principali, una pagina alla volta |
| `GET /api/comments/{id}/replies?parent_id=` | Risposte a un commento (serve l'account) |
| `POST /api/comments/{id}` | Pubblica un commento o una risposta (serve l'account) |
| `GET /api/subtitles/{id}` | Lingue sottotitoli disponibili |
| `GET /api/subtitles/{id}/{lang}.vtt` | Traccia sottotitoli (WebVTT) |
| `GET /api/channel/{id}/videos` | Ultimi video di un canale |
| `GET /api/suggestions?q=query` | Autocomplete |
| `GET /api/auth/status` | Stato cookie, account e sync |
| `GET /api/auth/me` | Canale dell'account collegato (per "commenta come") |
| `POST /api/history` · `DELETE` | Cronologia locale |
| `PATCH /api/prefs` | Preferenze |
| `GET /api/health` | Controllo che il server sia vivo |

> `/api/mux` genera il flusso in tempo reale con ffmpeg (nessuna
> transcodifica): è quello che permette la qualità piena, ma non espone la
> lunghezza del file — quindi nella barra si può tornare indietro, non saltare
> in avanti oltre quello che il player ha già scaricato.

---

## Sviluppo

```bash
# Server con reload
cd server && python3 -m uvicorn main:app --host 0.0.0.0 --port 8090 --reload

# Frontend con hot reload su :3000 (le chiamate /api vanno in proxy a :8090)
cd frontend && npm run dev
```

Il server serve i file già buildati in `frontend/dist/`, che **è versionato**:
dopo aver modificato il frontend esegui `npm run build` e committa anche la
build. La porta 8090 è ripetuta in più file (`server/main.py`,
`frontend/vite.config.js`, `electron/main.js` e gli script di avvio): se la
cambi, allineali tutti — oppure imposta la variabile d'ambiente `YTPROXY_PORT`
lato server. Il login Google non entra più in questo elenco: il device flow non
ha redirect URI, quindi su Google Cloud Console non c'è nessuna porta da tenere
allineata.

---

## Note legali

Questo progetto è solo per uso personale.  
Non ridistribuire contenuti scaricati. Rispetta i termini di servizio di YouTube.
