import { DOUBLE_TAP_MS, TAP_SIDE_RATIO, TAP_SLOP_PX } from "../VideoPlayer/playerConstants";

export { formatTime } from "../VideoPlayer/videoPlayerHelpers";

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
