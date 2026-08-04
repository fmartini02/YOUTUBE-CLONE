import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Integrazione Google Cast (Chromecast) via Cast Web Sender SDK.
 *
 * Disponibile SOLO in browser Chrome/Edge/Brave desktop (il componente Cast è
 * proprietario di Google, non presente in Chromium open-source né in Electron
 * né in Firefox/Safari) — su quei runtime `available` resta false, la UI che
 * dipende da questo hook (CastButton, CastBar) si nasconde da sola.
 *
 * Gestisce sia riproduzione singola sia coda (queue): ogni video viene
 * caricato come chrome.cast.media.QueueItem, così "Aggiungi alla coda" può
 * accodare senza interrompere quello in corso.
 */

const RECEIVER_APP_ID = import.meta.env.VITE_CAST_APP_ID || "CC1AD845"; // default media receiver di Google

/**
 * Carica l'SDK Cast. Restituisce {ok, reason}: quando fallisce il motivo serve
 * a dirlo all'utente, altrimenti il pulsante "Trasmetti" sparirebbe in
 * silenzio senza dare modo di capire cosa non va.
 */
function loadCastSdk() {
  return new Promise(resolve => {
    if (window.cast?.framework) return resolve({ ok: true });

    if (/Electron/i.test(navigator.userAgent)) {
      return resolve({ ok: false, reason: "electron" });
    }
    if (!/Chrome|Edg|Brave|Chromium/i.test(navigator.userAgent)) {
      return resolve({ ok: false, reason: "browser" });
    }

    let done = false;
    const finish = (r) => { if (!done) { done = true; resolve(r); } };

    window.__onGCastApiAvailable = (isAvailable) =>
      finish(isAvailable ? { ok: true } : { ok: false, reason: "no-cast" });

    if (!document.getElementById("__cast_sdk_script")) {
      const script = document.createElement("script");
      script.id = "__cast_sdk_script";
      script.src = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
      // Tipicamente: Brave Shields o un adblocker che blocca gstatic.com.
      script.onerror = () => finish({ ok: false, reason: "blocked" });
      document.head.appendChild(script);
    }

    // Lo script può caricarsi ma non annunciare mai l'SDK (componente Cast
    // assente o disattivato nel browser).
    setTimeout(() => finish(
      window.cast?.framework ? { ok: true } : { ok: false, reason: "timeout" },
    ), 6000);
  });
}

export const CAST_UNAVAILABLE_MESSAGE = {
  electron: "La trasmissione non è disponibile nell'app desktop: aprila in Brave o Chrome.",
  browser: "Serve un browser Chrome, Brave o Edge per trasmettere.",
  blocked: "Lo script di Google Cast è stato bloccato (Brave Shields o adblocker). Disattiva lo scudo su questo sito e ricarica.",
  "no-cast": "Il browser non espone il componente Cast. Su Brave: brave://settings → Sistema → attiva Media Router, poi riavvia il browser.",
  timeout: "Google Cast non ha risposto. Controlla la connessione e che il componente Cast del browser sia attivo.",
};

function buildMediaInfo(media) {
  const info = new window.chrome.cast.media.MediaInfo(media.streamUrl, "video/mp4");
  info.metadata = new window.chrome.cast.media.GenericMediaMetadata();
  info.metadata.title = media.title || "";
  info.metadata.subtitle = media.channel || "";
  if (media.thumbnail) info.metadata.images = [new window.chrome.cast.Image(media.thumbnail)];
  if (media.duration) info.duration = media.duration;
  info.customData = { videoId: media.videoId, channel: media.channel, thumbnail: media.thumbnail };
  return info;
}

function queueItemToMedia(item) {
  const md = item?.media;
  return {
    itemId: item?.itemId,
    videoId: md?.customData?.videoId,
    title: md?.metadata?.title,
    channel: md?.metadata?.subtitle || md?.customData?.channel,
    thumbnail: md?.metadata?.images?.[0]?.url || md?.customData?.thumbnail,
  };
}

const PLAYER_STATE_MAP = { PLAYING: "playing", PAUSED: "paused", BUFFERING: "buffering", IDLE: "idle" };

export function useCast() {
  const [available, setAvailable] = useState(false);
  const [unavailableReason, setUnavailableReason] = useState(null);
  const [connected, setConnected] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [castState, setCastState] = useState("idle");
  const [currentMedia, setCurrentMedia] = useState(null);
  const [queue, setQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(-1);

  const playerRef = useRef(null);
  const controllerRef = useRef(null);

  const getSession = () => window.cast?.framework?.CastContext?.getInstance()?.getCurrentSession();
  // I metodi di coda vivono su chrome.cast.media.Media (session.getMediaSession()),
  // non su CastSession — CastSession espone solo loadMedia/endSession/ecc.
  const getMedia = () => getSession()?.getMediaSession() || null;

  const syncFromPlayer = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    setConnected(!!player.isConnected);
    setCastState(PLAYER_STATE_MAP[player.playerState] || "idle");

    const items = player.queueData?.items || [];
    const mapped = items.map(queueItemToMedia);
    setQueue(mapped);

    // RemotePlayer non espone currentItemId: sta solo su chrome.cast.media.Media.
    const media = getMedia();
    const currentItemId = media?.currentItemId ?? null;
    const idx = items.findIndex(it => it.itemId === currentItemId);
    setQueueIndex(idx);
    setCurrentMedia(idx >= 0 ? mapped[idx] : (player.mediaInfo ? queueItemToMedia({ media: player.mediaInfo }) : null));

    setDeviceName(getSession()?.getCastDevice()?.friendlyName || "");
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadCastSdk().then(({ ok, reason }) => {
      if (cancelled) return;
      if (!ok) {
        setUnavailableReason(reason);
        return;
      }
      const ctx = window.cast.framework.CastContext.getInstance();
      ctx.setOptions({
        receiverApplicationId: RECEIVER_APP_ID,
        autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
      });

      const player = new window.cast.framework.RemotePlayer();
      const controller = new window.cast.framework.RemotePlayerController(player);
      playerRef.current = player;
      controllerRef.current = controller;

      // CURRENT_ITEM_ID_CHANGED non esiste nell'enum: MEDIA_INFO_CHANGED si
      // attiva già ad ogni cambio di item in coda, quindi basta quello.
      const EV = window.cast.framework.RemotePlayerEventType;
      [EV.IS_CONNECTED_CHANGED, EV.PLAYER_STATE_CHANGED, EV.MEDIA_INFO_CHANGED,
       EV.QUEUE_DATA_CHANGED].forEach(ev => {
        controller.addEventListener(ev, syncFromPlayer);
      });

      setAvailable(true);
      syncFromPlayer();
    });
    return () => { cancelled = true; };
  }, [syncFromPlayer]);

  const openDialog = useCallback(async () => {
    if (!available) return;
    try {
      await window.cast.framework.CastContext.getInstance().requestSession();
    } catch {
      // utente ha chiuso il selettore dispositivi: nessun errore da mostrare
    }
  }, [available]);

  // I metodi di coda su chrome.cast.media.Media sono callback-based
  // (successCallback, errorCallback), non Promise come CastSession#loadMedia:
  // li avvolgo per poter usare await/try-catch in modo uniforme.
  function callMedia(media, method, ...args) {
    return new Promise((resolve, reject) => {
      if (!media || typeof media[method] !== "function") return reject();
      media[method](...args, () => resolve(true), () => reject());
    });
  }

  const castVideo = useCallback(async (media) => {
    if (!available) return false;
    let session = getSession();
    if (!session) {
      try {
        await window.cast.framework.CastContext.getInstance().requestSession();
      } catch {
        return false;
      }
      session = getSession();
    }
    if (!session) return false;

    // Il Default Media Receiver tratta comunque ogni loadMedia come una coda
    // implicita di 1 elemento, quindi i successivi addToQueue si accodano.
    const request = new window.chrome.cast.media.LoadRequest(buildMediaInfo(media));
    try {
      await session.loadMedia(request);
      return true;
    } catch {
      return false;
    }
  }, [available]);

  const addToQueue = useCallback(async (media) => {
    if (!available) return false;
    const mediaSession = getMedia();
    if (!mediaSession) return castVideo(media); // niente sessione attiva: parte subito invece di accodare nel vuoto

    const item = new window.chrome.cast.media.QueueItem(buildMediaInfo(media));
    const request = new window.chrome.cast.media.QueueInsertItemsRequest([item]);
    try {
      await callMedia(mediaSession, "queueInsertItems", request);
      return true;
    } catch {
      return false;
    }
  }, [available, castVideo]);

  const pauseResume = useCallback(() => {
    controllerRef.current?.playOrPause();
  }, []);

  const stopCast = useCallback(() => {
    controllerRef.current?.stop();
  }, []);

  const seek = useCallback((seconds) => {
    const player = playerRef.current;
    if (!player) return;
    player.currentTime = seconds;
    controllerRef.current?.seek();
  }, []);

  const next = useCallback(() => {
    const m = getMedia();
    if (m) callMedia(m, "queueNext").catch(() => {});
  }, []);

  const previous = useCallback(() => {
    const m = getMedia();
    if (m) callMedia(m, "queuePrev").catch(() => {});
  }, []);

  const playQueueItem = useCallback((itemId) => {
    const m = getMedia();
    if (m) callMedia(m, "queueJumpToItem", itemId).catch(() => {});
  }, []);

  const removeFromQueue = useCallback((itemId) => {
    // queueRemoveItem è singolare: un solo itemId numerico, non un array.
    const m = getMedia();
    if (m) callMedia(m, "queueRemoveItem", itemId).catch(() => {});
  }, []);

  return {
    available, unavailableReason, connected, deviceName, castState, currentMedia,
    queue, queueIndex,
    castVideo, addToQueue, pauseResume, stopCast, seek,
    next, previous, playQueueItem, removeFromQueue,
    openDialog,
  };
}
