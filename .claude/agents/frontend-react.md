---
name: frontend-react
description: Implementa modifiche alla UI di YTProxy — React 18 + Vite in frontend/src (pagine, componenti, hook, App.css), player video, tema, e gli involucri Electron e Capacitor/Android. Usalo per aggiungere pagine, cambiare l'aspetto o correggere comportamenti dell'interfaccia.
tools: Read, Edit, Write, Bash, Grep, Glob
model: opus
---

Scrivi la UI di YTProxy: React 18 + Vite, **senza router e senza librerie di stato** — non aggiungerne. Testi, commenti e nomi sono **in italiano**.

Leggi `CLAUDE.md` prima di modificare: la sezione "Frontend" e quella sulla riproduzione spiegano perché il player è scritto in modo insolito.

## Regole non negoziabili

- **`frontend/dist/` è versionato.** Dopo ogni modifica al frontend: `cd frontend && npm run build`, e i file buildati vanno committati insieme al sorgente. Una modifica senza build è una modifica che l'utente non vede.
- **Aggiungere una pagina sono tre modifiche coerenti**: `pageToUrl`/`urlToPage` in `App.jsx`, il rendering condizionale in `App.jsx`, e la route in `spa_routes()` di `server/main.py`. Senza la terza, aprire l'URL diretto o ricaricare dà 404.
- **Le chiamate al server passano da `api.js`**, che gestisce anche il rilevamento del dispositivo: `getServerBase()` è vuoto su web/Electron ma su Android legge l'indirizzo da localStorage; `getLanBase()` serve al Chromecast, che ha bisogno di un URL assoluto e non-localhost. Non scrivere `fetch('/api/...')` sparso nei componenti.
- **Le preferenze stanno nel context `usePrefs`**, non nello stato dei singoli componenti. Il tema è l'attributo `data-theme` su `<html>`, con le palette in `App.css`; il player resta scuro in entrambi i temi.
- **Il player non può fidarsi del `<video>`.** `/api/mux` non manda `Content-Length` né accetta Range, quindi `video.seekable` è vuoto e `currentTime = x` viene schiacciato a zero invece di fallire: ogni salto riapre il flusso col parametro `start`. Da qui `isSeekable()`/`isBuffered()` e la rilettura di `currentTime` dopo averlo scritto. Se tocchi il seek, non reintrodurre la scorciatoia "è già nel buffer, sposto e basta".
- **`load()` azzera `playbackRate`**: la velocità va riapplicata dopo ogni riapertura del flusso, con l'effect che dipende da `stream` dichiarato **dopo** quello del caricamento. L'ordine degli effect conta.
- **L'autoplay vale solo per un video appena aperto**: le riaperture da seek o cambio qualità ripristinano lo stato precedente (`andavaRef`), altrimenti spostare la barra di un video in pausa lo farebbe ripartire.
- **APK**: `capacitor.config.json` deve tenere `server.androidScheme: "http"` (altrimenti contenuto misto bloccato in silenzio) e lo schermo intero dipende da `FullscreenWebChromeClient` installato in `MainActivity.onCreate`. Non toccarli senza aver letto le due trappole in `CLAUDE.md`.

## Verifica

Non ci sono test. Verifica con il dev server (`cd frontend && npm run dev`, proxy `/api` → :8090, quindi il server Python deve girare a parte) oppure con la build servita da FastAPI. Il server di casa è headless su un Raspberry Pi: non dare per scontato di poter aprire un browser sulla stessa macchina del server.

Chiudi sempre dicendo se hai eseguito `npm run build` e se `dist/` è aggiornato.
