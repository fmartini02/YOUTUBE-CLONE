# YTProxy — YouTube senza pubblicità

Un'app che fa da intermediario tra te e YouTube: stessa UI, zero pubblicità.  
Funziona su **PC, telefono, Smart TV** — tutto dal browser.

---

## Come funziona

```
Il tuo PC (server)
├── FastAPI + yt-dlp  →  scarica/streamma i video
└── Frontend React    →  UI identica a YouTube

Accesso da:
├── 💻 PC desktop    →  http://localhost:8080  (o app Electron con VLC)
├── 📱 Telefono      →  http://IP-PC:8080  (stessa WiFi)
└── 📺 Smart TV      →  http://IP-PC:8080  (browser TV)
```

---

## Installazione rapida

### Requisiti
- **Python 3.10+** → https://python.org
- **Node.js 18+** → https://nodejs.org
- **ffmpeg** → https://ffmpeg.org (per merge audio+video)
- **VLC** (opzionale, solo per desktop) → https://videolan.org

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
python -m uvicorn main:app --host 0.0.0.0 --port 8080
```

---

## App Electron (desktop, apre VLC automaticamente)

```bash
# Dalla root del progetto
npm install
npm run build:frontend
npm start
```

Quando clicchi su un video:
- La app lo **streamma** nel player interno
- Il bottone **"Scarica MP4"** lo scarica in locale
- Su desktop Electron, può aprirlo **direttamente in VLC**

---

## Accesso da telefono / Smart TV

1. Avvia il server sul PC con `start_server.sh`
2. Connetti telefono/TV alla **stessa WiFi** del PC
3. Apri il browser sul telefono/TV
4. Vai su `http://IP-DEL-PC:8080`

Per trovare l'IP del PC:
- **Windows**: `ipconfig` → "Indirizzo IPv4"
- **Mac/Linux**: `ip a` oppure `ifconfig`

> L'indirizzo sarà tipo `192.168.1.XX`

---

## Accesso fuori casa (VPN Tailscale)

1. Installa [Tailscale](https://tailscale.com) su PC e telefono (gratis)
2. Avvia il server sul PC
3. Sul telefono usa l'IP Tailscale del PC invece di quello locale

---

## Comportamento per dispositivo

| Dispositivo | Riproduzione | Download |
|---|---|---|
| Desktop (browser) | Player integrato | Scarica MP4 |
| Desktop (Electron) | Player interno + VLC | Scarica MP4 |
| Telefono Android | Player integrato | Apri con app scelta |
| iPhone/iPad | Player integrato | Apri con VLC mobile |
| Smart TV | Player integrato | — |

---

## Struttura progetto

```
ytproxy/
├── server/
│   ├── main.py          # FastAPI + yt-dlp
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── api.js        # API + device detection
│   │   ├── components/
│   │   │   ├── Header.jsx
│   │   │   ├── Sidebar.jsx
│   │   │   └── VideoCard.jsx
│   │   └── pages/
│   │       ├── HomePage.jsx
│   │       ├── SearchPage.jsx
│   │       └── VideoPage.jsx
│   └── package.json
├── electron/
│   ├── main.js          # Electron main (apre VLC)
│   └── preload.js
├── start_server.sh      # Avvio Linux/Mac
├── start_server.bat     # Avvio Windows
└── README.md
```

---

## API disponibili

| Endpoint | Descrizione |
|---|---|
| `GET /api/trending` | Video trending |
| `GET /api/search?q=query` | Ricerca video |
| `GET /api/video/{id}` | Info video |
| `GET /api/stream/{id}?quality=720` | URL stream diretto |
| `GET /api/download/{id}?quality=720` | Scarica MP4 |
| `GET /api/suggestions?q=query` | Autocomplete |

---

## Note legali

Questo progetto è solo per uso personale.  
Non ridistribuire contenuti scaricati. Rispetta i termini di servizio di YouTube.
