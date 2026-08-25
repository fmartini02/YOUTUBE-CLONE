import { formatSpeed, HOLD_SPEED } from "./speedMath";

// Riscontro del doppio tocco: senza, un salto che deve ancora riaprire il
// flusso sembra un tocco andato a vuoto.
function SeekFlash({ seekFlash }) {
  if (!seekFlash) return null;
  return (
    <div className={`player-seek-flash ${seekFlash.side}`}>
      <span className="material-symbols-outlined">
        {seekFlash.side === "left" ? "fast_rewind" : "fast_forward"}
      </span>
      <span>{seekFlash.seconds} s</span>
    </div>
  );
}

// I riscontri visivi sopra il video: spinner di caricamento, doppio tocco per
// saltare, "tieni premuto" per il 2x, e il grande tasto play quando è in
// pausa. Nessuno tocca stato del player, solo props.
export default function PlayerOverlays({ buffering, seekFlash, holding, playing, togglePlay }) {
  return (
    <>
      {buffering && <div className="player-spinner" />}
      <SeekFlash seekFlash={seekFlash} />

      {/* Riscontro del "tieni premuto": senza, il 2x è invisibile finché non si
          sente l'audio accelerato. */}
      {holding && (
        <div className="player-hold-flash">
          <span>{formatSpeed(HOLD_SPEED)}x</span>
          <span className="material-symbols-outlined">fast_forward</span>
        </div>
      )}

      {!playing && !buffering && (
        <button className="player-big-play" onClick={togglePlay} aria-label="Riproduci">
          <span className="material-symbols-outlined">play_arrow</span>
        </button>
      )}
    </>
  );
}
