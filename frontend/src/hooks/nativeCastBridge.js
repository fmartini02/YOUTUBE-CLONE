import { registerPlugin } from "@capacitor/core";

/**
 * Ponte verso il plugin nativo YtCast (frontend/android/.../CastBridgePlugin.java).
 * Sul web `registerPlugin` torna un proxy che lancia solo quando lo si chiama —
 * qui non succede mai, perché useCast sceglie questo ramo solo se
 * `Capacitor.isNativePlatform()`.
 */
export const YtCast = registerPlugin("YtCast");

/**
 * Payload di YtCast.loadMedia dal `media` del frontend (vedi useCastMedia).
 * `opts` (fase 2): `sub` = {url, lang} per un track sottotitolo side-loaded,
 * `fontScale` per la dimensione, `rate` da riapplicare dopo la ricarica
 * (un nuovo load azzera la velocità sul receiver, come `load()` lato player).
 */
export function nativeLoadPayload(media, currentTime, opts) {
  const p = {
    url: media.streamUrl,
    contentType: media.contentType || "video/mp4",
    title: media.title || "",
    subtitle: media.channel || "",
    thumbnail: media.thumbnail || "",
    videoId: media.videoId || "",
    currentTime: currentTime || 0,
  };
  if (opts?.sub?.url) {
    p.tracks = [{ trackId: 1, url: opts.sub.url, lang: opts.sub.lang || "", name: opts.sub.lang || "CC" }];
    p.activeTrackIds = [1];
    p.subtitleFontScale = opts.fontScale || 1;
  }
  if (opts?.rate > 0) p.playbackRate = opts.rate;
  return p;
}

// showDevicePicker apre solo il selettore: la connessione arriva (o no) come
// evento castStateChanged. Qui la si aspetta, con un tetto — se l'utente chiude
// il selettore senza scegliere non c'è nessun evento di "annullato".
export function waitForConnected(ms = 60000) {
  return new Promise((resolve) => {
    let done = false;
    let handle = null;
    const finish = (v) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (handle) handle.remove();
      resolve(v);
    };
    const timer = setTimeout(() => finish(false), ms);
    YtCast.addListener("castStateChanged", (s) => { if (s?.connected) finish(true); })
      .then((h) => { handle = h; if (done) h.remove(); });
  });
}

/** Apre il selettore se serve, poi carica il video. {ok:true} | {ok:false,error}. */
export async function nativeStartCast(media) {
  const { available } = await YtCast.isAvailable();
  if (!available) return { ok: false, error: "unavailable" };

  const st = await YtCast.getState().catch(() => null);
  if (!st?.connected) {
    await YtCast.showDevicePicker();
    if (!(await waitForConnected())) return { ok: false, error: "no-device" };
  }
  try {
    await YtCast.loadMedia(nativeLoadPayload(media, 0));
    return { ok: true };
  } catch {
    return { ok: false, error: "load" };
  }
}

/** Aggancia i due listener del plugin; torna la funzione di cleanup. */
export function subscribeCast(onState, onMedia) {
  const subs = [
    YtCast.addListener("castStateChanged", onState),
    YtCast.addListener("mediaStatusChanged", onMedia),
  ];
  return () => subs.forEach((p) => p.then((h) => h.remove()));
}
