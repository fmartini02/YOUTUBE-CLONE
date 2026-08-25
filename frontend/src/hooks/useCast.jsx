import { useEffect, useRef, useCallback } from "react";
import { loadCastSdk } from "./castSdk";
import { buildMediaInfo, waitForDevices } from "./castMedia";
import { RECEIVER_APP_ID, PLAYER_STATE } from "./castConstants";
import { useCastState } from "./useCastState";

export { CAST_UNAVAILABLE_MESSAGE, CAST_ERROR_MESSAGE } from "./castConstants";

function getCastContext() {
  return window.cast?.framework?.CastContext?.getInstance() || null;
}

function syncFromContext(ctx, playerRef, setters) {
  const state = ctx.getCastState();   // NO_DEVICES_AVAILABLE | NOT_CONNECTED | CONNECTING | CONNECTED
  const player = playerRef.current;
  const isConnected = state === "CONNECTED";

  setters.setConnected(isConnected);
  setters.setConnecting(state === "CONNECTING");
  setters.setDeviceName(ctx.getCurrentSession()?.getCastDevice()?.friendlyName || "");
  setters.setPlayerState(PLAYER_STATE[player?.playerState] || "idle");
  // mediaInfo resta valorizzato anche dopo la disconnessione: senza il
  // controllo su isConnected il bottone continuerebbe a dire "Interrompi".
  setters.setCastingVideoId(isConnected ? (player?.mediaInfo?.customData?.videoId || null) : null);
}

/** Wiring del framework Cast dopo il caricamento dell'SDK. Torna la funzione di cleanup. */
function setupCastFramework(setters, playerRef, sync) {
  const framework = window.cast.framework;
  const ctx = framework.CastContext.getInstance();
  ctx.setOptions({
    receiverApplicationId: RECEIVER_APP_ID,
    // ORIGIN_SCOPED + resumeSavedSession: se ricarichiamo la pagina mentre
    // la TV sta ancora trasmettendo, riagganciamo la sessione esistente
    // invece di mostrare il bottone come se non stesse succedendo nulla.
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

  setters.setAvailable(true);
  sync();

  return () => {
    playerEvents.forEach(ev => controller.removeEventListener(ev, sync));
    ctx.removeEventListener(CTX_EV.CAST_STATE_CHANGED, sync);
    ctx.removeEventListener(CTX_EV.SESSION_STATE_CHANGED, sync);
  };
}

/**
 * Manda il video sulla TV: se non c'è ancora una sessione apre il selettore
 * dei dispositivi, poi carica il video sulla sessione ottenuta. Restituisce
 * {ok:true} oppure {ok:false, error}. "cancel" è l'utente che chiude il
 * selettore — non un errore da mostrare.
 */
async function startCastImpl(available, media, sync) {
  const ctx = getCastContext();
  if (!available || !ctx) return { ok: false, error: "unavailable" };

  if (!ctx.getCurrentSession()) {
    // Il selettore di Chrome/Brave si apre anche quando in rete non c'è
    // nessun dispositivo, e requestSession() non risponde finché l'utente
    // non lo chiude: meglio accorgersene prima. La scoperta è pigra, quindi
    // le si danno qualche secondo prima di arrendersi.
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
}

/**
 * Chromecast — integrazione minima con il Cast Web Sender SDK di Google.
 *
 * Fa una cosa sola: mandare UN video sulla TV e interromperlo. Niente coda,
 * niente telecomando remoto — una volta partito, il video si comanda dal
 * telecomando della TV o da Google Home. Tutta la UI del cast è un solo
 * bottone (vedi CastButton).
 *
 * Disponibile SOLO in Chrome/Edge/Brave desktop: il componente Cast è
 * proprietario di Google e non esiste in Chromium open-source, in Electron,
 * in Firefox né in Safari. Su quei runtime `available` resta false e
 * `unavailableReason` dice il perché.
 */
export function useCast() {
  const { state, setters } = useCastState();
  const playerRef = useRef(null);

  const sync = useCallback(() => {
    const ctx = getCastContext();
    if (ctx) syncFromContext(ctx, playerRef, setters);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- setters contiene solo setState, stabili fra i render

  useEffect(() => {
    let cancelled = false;
    let cleanup = null;

    loadCastSdk().then(({ ok, reason }) => {
      if (cancelled) return;
      if (!ok) { setters.setUnavailableReason(reason); return; }
      cleanup = setupCastFramework(setters, playerRef, sync);
    });

    return () => { cancelled = true; cleanup?.(); };
  }, [sync]); // eslint-disable-line react-hooks/exhaustive-deps

  const startCast = useCallback(media => startCastImpl(state.available, media, sync), [state.available, sync]);
  /** Chiude la sessione e spegne il receiver sulla TV. */
  const stopCast = useCallback(() => { getCastContext()?.endCurrentSession(true); sync(); }, [sync]);

  return { ...state, startCast, stopCast };
}
