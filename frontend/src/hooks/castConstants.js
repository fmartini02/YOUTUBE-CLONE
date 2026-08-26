// Default Media Receiver di Google: riproduce MP4 H.264+AAC senza dover
// registrare (e pagare) un receiver personalizzato. VITE_CAST_APP_ID permette
// comunque di puntare a un receiver proprio, se lo si è registrato.
export const RECEIVER_APP_ID = import.meta.env.VITE_CAST_APP_ID || "CC1AD845";

export const CAST_UNAVAILABLE_MESSAGE = {
  "app-android": "La trasmissione non è disponibile nell'app Android: il componente Google Cast esiste solo in Chrome, Brave o Edge su computer. Per mandare un video sulla TV apri YTProxy dal browser del PC; in alternativa usa la trasmissione schermo di Android.",
  electron: "La trasmissione non è disponibile nell'app desktop: apri YTProxy in Chrome, Brave o Edge.",
  browser: "Serve un browser Chrome, Brave o Edge per trasmettere.",
  blocked: "Lo script di Google Cast è stato bloccato (Brave Shields o adblocker). Disattiva lo scudo su questo sito e ricarica.",
  "no-cast": "Il browser non espone il componente Cast. Su Brave: brave://settings → Sistema → attiva Media Router, poi riavvia il browser.",
  timeout: "Google Cast non ha risposto. Controlla la connessione e che il componente Cast del browser sia attivo.",
};

export const CAST_ERROR_MESSAGE = {
  unavailable: "Trasmissione non disponibile in questo browser.",
  "no-device": "Nessun dispositivo trovato: accendi la TV (in standby non si annuncia) e controlla che sia sulla stessa rete Wi-Fi del PC, senza isolamento client. Le TV solo AirPlay o DLNA non compaiono qui.",
  load: "Il Chromecast non è riuscito ad avviare il video. Riprova, o scegli una qualità più bassa.",
};

export const PLAYER_STATE = { PLAYING: "playing", PAUSED: "paused", BUFFERING: "buffering", IDLE: "idle" };
