const WRAP = { background: "#0f0f0f", color: "#fff", padding: "4px 14px 12px" };
const NAV = { display: "flex", gap: 10, padding: "6px 0" };
const NAV_BTN = {
  flex: 1, background: "#272727", border: "none", color: "#fff",
  fontSize: 13, padding: "8px 0", borderRadius: 6, cursor: "pointer",
};
const LIST = { listStyle: "none", margin: 0, padding: 0, maxHeight: 160, overflowY: "auto" };
const ITEM = { fontSize: 12, padding: "6px 8px", borderRadius: 4, color: "rgba(255,255,255,0.75)" };
const CURRENT = { background: "rgba(255,255,255,0.12)", color: "#fff", fontWeight: 600 };

/**
 * Coda del cast: precedente/successivo + elenco essenziale. Compare solo con
 * almeno due video in coda (un solo video = niente da mostrare). La coda vive
 * sul receiver (MediaQueue di Google Cast), qui è solo lo specchio.
 */
export default function CastRemoteQueue({ queue, onNext, onPrev }) {
  if (!queue || queue.length < 2) return null;
  return (
    <div style={WRAP}>
      <div style={NAV}>
        <button style={NAV_BTN} onClick={onPrev}>⏮ Precedente</button>
        <button style={NAV_BTN} onClick={onNext}>Successivo ⏭</button>
      </div>
      <ol style={LIST}>
        {queue.map((it, i) => (
          <li key={it.itemId ?? i} style={{ ...ITEM, ...(it.current ? CURRENT : null) }}>
            {i + 1}. {it.title || "Video"}
          </li>
        ))}
      </ol>
    </div>
  );
}
