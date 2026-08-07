import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Chromecast — integrazione minima con il Cast Web Sender SDK di Google.
 *
 * Fa una cosa sola: mandare UN video sulla TV e interromperlo. Niente coda,
 * niente telecomando remoto — una volta partito, il video si comanda dal
 * telecomando della TV o da Google Home, come con l'app YouTube. Tutta la UI
 * del cast è un solo bottone (vedi CastButton).
 *
 * Disponibile SOLO in Chrome/Edge/Brave desktop: il componente Cast è
 * proprietario di Google e non esiste in Chromium open-source, in Electron,
 * in Firefox né in Safari. Su quei runtime `available` resta false e
 * `unavailableReason` dice il perché, così il bottone può spiegarlo invece di
 * sparire in silenzio.
 */

// Default Media Receiver di Google: riproduce MP4 H.264+AAC senza dover
// registrare (e pagare) un receiver personalizzato. VITE_CAST_APP_ID permette
// comunque di puntare a un receiver proprio, se lo si è registrato.
const RECEIVER_APP_ID = import.meta.env.VITE_CAST_APP_ID || "CC1AD845";

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

/**
 * Carica lo script dell'SDK una volta sola per pagina (promessa condivisa fra
 * tutte le istanze dell'hook). Restituisce {ok, reason}: quando fallisce, il
 * motivo serve per poterlo dire all'utente.
 */
let sdkPromise = null;

function loadCastSdk() {
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise(resolve => {
    if (window.cast?.framework) return resolve({ ok: true });

    if (/Electron/i.test(navigator.userAgent) || window.__YTPROXY_ELECTRON__) {
      return resolve({ ok: false, reason: "electron" });
    }
    // WebView di Android (app Capacitor): la UA contiene "Chrome" e supera il
    // controllo qui sotto, ma il componente Cast non c'è. Senza questo caso si
    // scaricava lo script di Google per niente e si aspettavano 8 secondi per
    // dire "timeout", cioè un motivo sbagliato: non è un problema di rete o di
    // impostazioni del browser, su Android quel componente non esiste.
    if (window.Capacitor?.isNativePlatform?.() || /;\s*wv\)/.test(navigator.userAgent)) {
      return resolve({ ok: false, reason: "app-android" });
    }
    if (!/Chrome|Edg|Brave|Chromium/i.test(navigator.userAgent)) {
      return resolve({ ok: false, reason: "browser" });
    }

    let done = false;
    const finish = (r) => { if (!done) { done = true; resolve(r); } };

    window.__onGCastApiAvailable = (isAvailable) =>
      finish(isAvailable ? { ok: true } : { ok: false, reason: "no-cast" });

    const script = document.createElement("script");
    script.id = "__cast_sdk_script";
    script.src = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
    // Tipicamente: Brave Shields o un adblocker che blocca gstatic.com.
    script.onerror = () => finish({ ok: false, reason: "blocked" });
    document.head.appendChild(script);

    // Lo script può caricarsi senza mai annunciare l'SDK (componente Cast
    // assente o disattivato nel browser): senza timeout resteremmo in attesa
    // per sempre e il bottone non direbbe mai cosa non va.
    setTimeout(() => finish(
      window.cast?.framework ? { ok: true } : { ok: false, reason: "timeout" },
    ), 8000);
  });

  return sdkPromise;
}

const PLAYER_STATE = { PLAYING: "playing", PAUSED: "paused", BUFFERING: "buffering", IDLE: "idle" };

/**
 * Aspetta che la scoperta dei dispositivi dia un esito, al massimo `ms`.
 * Torna false solo se dopo l'attesa non si è ancora annunciato nessuno.
 */
async function waitForDevices(ctx, ms = 3000) {
  const scaduto = Date.now() + ms;
  while (ctx.getCastState() === "NO_DEVICES_AVAILABLE" && Date.now() < scaduto) {
    await new Promise(r => setTimeout(r, 250));
  }
  return ctx.getCastState() !== "NO_DEVICES_AVAILABLE";
}

function buildMediaInfo(media) {
  const cc = window.chrome.cast;
  const info = new cc.media.MediaInfo(media.streamUrl, "video/mp4");
  info.streamType = cc.media.StreamType.BUFFERED;
  info.metadata = new cc.media.GenericMediaMetadata();
  info.metadata.title = media.title || "";
  info.metadata.subtitle = media.channel || "";
  if (media.thumbnail) info.metadata.images = [new cc.Image(media.thumbnail)];
  if (media.duration) info.duration = media.duration;
  // Serve a riconoscere QUALE video sta girando sulla TV: il receiver ci
  // restituisce customData, l'URL dello stream invece può essere riscritto.
  info.customData = { videoId: media.videoId };
  return info;
}

export function useCast() {
  const [available, setAvailable] = useState(false);
  const [unavailableReason, setUnavailableReason] = useState(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [playerState, setPlayerState] = useState("idle");
  const [castingVideoId, setCastingVideoId] = useState(null);

  const playerRef = useRef(null);

  const getContext = () => window.cast?.framework?.CastContext?.getInstance() || null;

  const sync = useCallback(() => {
    const ctx = getContext();
    if (!ctx) return;
    const state = ctx.getCastState();   // NO_DEVICES_AVAILABLE | NOT_CONNECTED | CONNECTING | CONNECTED
    const player = playerRef.current;
    const isConnected = state === "CONNECTED";

    setConnected(isConnected);
    setConnecting(state === "CONNECTING");
    setDeviceName(ctx.getCurrentSession()?.getCastDevice()?.friendlyName || "");
    setPlayerState(PLAYER_STATE[player?.playerState] || "idle");
    // mediaInfo resta valorizzato anche dopo la disconnessione: senza il
    // controllo su isConnected il bottone continuerebbe a dire "Interrompi".
    setCastingVideoId(isConnected ? (player?.mediaInfo?.customData?.videoId || null) : null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let cleanup = null;

    loadCastSdk().then(({ ok, reason }) => {
      if (cancelled) return;
      if (!ok) { setUnavailableReason(reason); return; }

      const framework = window.cast.framework;
      const ctx = framework.CastContext.getInstance();
      ctx.setOptions({
        receiverApplicationId: RECEIVER_APP_ID,
        // ORIGIN_SCOPED + resumeSavedSession: se ricarichiamo la pagina
        // mentre la TV sta ancora trasmettendo, riagganciamo la sessione
        // esistente invece di mostrare il bottone come se non stesse
        // succedendo nulla.
        autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
        resumeSavedSession: true,
      });

      // Due sorgenti di eventi, entrambe necessarie: CastContext sa se siamo
      // connessi e a quale dispositivo, RemotePlayer sa cosa sta riproducendo.
      const player = new framework.RemotePlayer();
      const controller = new framework.RemotePlayerController(player);
      playerRef.current = player;

      const EV = framework.RemotePlayerEventType;
      const playerEvents = [EV.IS_CONNECTED_CHANGED, EV.PLAYER_STATE_CHANGED, EV.MEDIA_INFO_CHANGED];
      playerEvents.forEach(ev => controller.addEventListener(ev, sync));

      const CTX_EV = framework.CastContextEventType;
      ctx.addEventListener(CTX_EV.CAST_STATE_CHANGED, sync);
      ctx.addEventListener(CTX_EV.SESSION_STATE_CHANGED, sync);

      setAvailable(true);
      sync();

      cleanup = () => {
        playerEvents.forEach(ev => controller.removeEventListener(ev, sync));
        ctx.removeEventListener(CTX_EV.CAST_STATE_CHANGED, sync);
        ctx.removeEventListener(CTX_EV.SESSION_STATE_CHANGED, sync);
      };
    });

    return () => { cancelled = true; cleanup?.(); };
  }, [sync]);

  /**
   * Manda il video sulla TV: se non c'è ancora una sessione apre il selettore
   * dei dispositivi, poi carica il video sulla sessione ottenuta.
   * Restituisce {ok:true} oppure {ok:false, error}. "cancel" è l'utente che
   * chiude il selettore — non un errore da mostrare.
   */
  const startCast = useCallback(async (media) => {
    const ctx = getContext();
    if (!available || !ctx) return { ok: false, error: "unavailable" };

    if (!ctx.getCurrentSession()) {
      // Il selettore di Chrome/Brave si apre anche quando in rete non c'è
      // nessun dispositivo: mostra una finestra vuota, e siccome
      // requestSession() non risponde finché l'utente non la chiude, il
      // bottone resta su "Connessione…" senza spiegare niente. Meglio
      // accorgersene prima e dirlo. La scoperta però è pigra (parte quando
      // serve), quindi NO_DEVICES_AVAILABLE subito dopo il caricamento della
      // pagina non è ancora una risposta: le diamo qualche secondo.
      if (!await waitForDevices(ctx)) return { ok: false, error: "no-device" };

      try {
        await ctx.requestSession();
      } catch (err) {
        return { ok: false, error: err === "cancel" ? "cancel" : "no-device" };
      }
    }

    const session = ctx.getCurrentSession();
    if (!session) return { ok: false, error: "no-device" };

    const request = new window.chrome.cast.media.LoadRequest(buildMediaInfo(media));
    request.autoplay = true;
    try {
      await session.loadMedia(request);
      sync();
      return { ok: true };
    } catch {
      return { ok: false, error: "load" };
    }
  }, [available, sync]);

  /** Chiude la sessione e spegne il receiver sulla TV. */
  const stopCast = useCallback(() => {
    getContext()?.endCurrentSession(true);
    sync();
  }, [sync]);

  return {
    available, unavailableReason,
    connected, connecting, deviceName,
    playerState, castingVideoId,
    startCast, stopCast,
  };
}
