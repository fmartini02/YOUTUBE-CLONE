import { formatTime } from "./castRemoteHelpers";

const BTN = {
  background: "none", border: "none", color: "#fff", fontSize: 20,
  cursor: "pointer", padding: 4, lineHeight: 1,
};
const TIME = { fontSize: 12, color: "#fff", fontVariantNumeric: "tabular-nums" };

function seekFromEvent(e, duration, onSeek) {
  const rect = e.currentTarget.getBoundingClientRect();
  const rel = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  onSeek(rel * duration);
}

function ProgressBar({ position, duration, onSeek }) {
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  return (
    <div
      onPointerDown={(e) => duration > 0 && seekFromEvent(e, duration, onSeek)}
      style={{ flex: 1, height: 16, display: "flex", alignItems: "center", cursor: "pointer" }}
    >
      <div style={{ position: "relative", width: "100%", height: 4, background: "rgba(255,255,255,0.3)", borderRadius: 2 }}>
        <div style={{ position: "absolute", inset: "0 auto 0 0", width: `${pct}%`, background: "#f00", borderRadius: 2 }} />
      </div>
    </div>
  );
}

/**
 * Barra comandi del telecomando cast: ±10s, play/pausa, avanzamento.
 * Sempre scura, come i comandi del player locale in entrambi i temi.
 */
export default function CastRemoteBar({ position, duration, playing, onSeek, onSkip, onTogglePlay }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#0f0f0f" }}>
      <button style={BTN} onClick={() => onSkip(-10)} aria-label="Indietro 10 secondi">⏪</button>
      <button style={BTN} onClick={onTogglePlay} aria-label={playing ? "Pausa" : "Riproduci"}>{playing ? "⏸" : "▶"}</button>
      <button style={BTN} onClick={() => onSkip(10)} aria-label="Avanti 10 secondi">⏩</button>
      <span style={TIME}>{formatTime(position)}</span>
      <ProgressBar position={position} duration={duration} onSeek={onSeek} />
      <span style={TIME}>{formatTime(duration)}</span>
    </div>
  );
}
