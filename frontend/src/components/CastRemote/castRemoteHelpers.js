import { DOUBLE_TAP_MS, TAP_SIDE_RATIO, TAP_SLOP_PX } from "../VideoPlayer/playerConstants";
import { api } from "../../api";

export { formatTime } from "../VideoPlayer/videoPlayerHelpers";

// Payload di YtCast.queueAdd per un video preso dai correlati (o dalla riga
// azioni): shape { id | videoId, title, thumbnail, channel }. Qualità "best"
// (compat=1 sceglie comunque codec che il Chromecast decodifica) e URL LAN
// assoluto, come api.castUrl.
export function queuePayloadFor(item) {
  const id = item.videoId || item.id;
  return {
    streamUrl: api.castUrl(id, "best"),
    contentType: "video/mp4",
    title: item.title || "Video",
    channel: item.channel || item.author || "",
    thumbnail: item.thumbnail || "",
    videoId: id,
  };
}

// Doppio tocco sul terzo sinistro/destro dell'area video = salto ∓/±10s, come
// nel player locale (stesse costanti). Un tocco singolo fa play/pausa, ma
// ritardato di DOUBLE_TAP_MS: sotto quella soglia potrebbe ancora arrivare il
// secondo tocco. Torna gli handler pointer da spalmare sull'area.
export function makeTapHandlers(onSkip, onTogglePlay) {
  let last = 0;
  let sx = 0;
  let sy = 0;
  const down = (e) => { sx = e.clientX; sy = e.clientY; };
  const up = (e) => {
    if (Math.hypot(e.clientX - sx, e.clientY - sy) > TAP_SLOP_PX) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / rect.width;
    const now = Date.now();
    if (now - last < DOUBLE_TAP_MS) {
      last = 0;
      if (rel < TAP_SIDE_RATIO) onSkip(-10);
      else if (rel > 1 - TAP_SIDE_RATIO) onSkip(10);
      else onTogglePlay();
      return;
    }
    last = now;
    setTimeout(() => { if (last === now) onTogglePlay(); }, DOUBLE_TAP_MS);
  };
  return { onPointerDown: down, onPointerUp: up };
}
