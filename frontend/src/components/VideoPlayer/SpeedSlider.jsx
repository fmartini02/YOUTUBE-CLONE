import { useRef } from "react";
import { SPEED_MIN, SPEED_MAX, SPEED_STEP, SPEED_LABEL_STEP, formatSpeed, roundSpeed } from "./speedMath";
import { handleTrackPointerDown, handleTrackPointerMove, handleTrackKeyDown } from "./speedTrackHandlers";

// I riferimenti scritti sotto la barra, uno ogni mezza velocità.
function SpeedTicks({ value }) {
  const ticks = [];
  for (let s = SPEED_MIN; s <= SPEED_MAX + 0.001; s += SPEED_LABEL_STEP) ticks.push(roundSpeed(s));
  return (
    <div className="player-speed-ticks">
      {ticks.map(t => (
        <span key={t} className={t === value ? "on" : undefined}>{formatSpeed(t)}x</span>
      ))}
    </div>
  );
}

// La sola pista trascinabile. Separata da SpeedSlider solo per restare sotto
// le 25 righe: il ref e gli handler restano sullo stesso div di sempre,
// niente è cambiato nel comportamento del trascinamento.
function SpeedFill({ pct }) {
  return (
    <>
      <div className="player-speed-fill" style={{ width: `${pct}%` }} />
      <div className="player-speed-handle" style={{ left: `${pct}%` }} />
    </>
  );
}

function SpeedTrack({ value, onChange, trackRef, draggingRef }) {
  const pct = ((value - SPEED_MIN) / (SPEED_MAX - SPEED_MIN)) * 100;
  const stopDrag = () => { draggingRef.current = false; };
  return (
    <div className="player-speed-bar">
      <div
        className="player-speed-track" ref={trackRef} tabIndex={0} role="slider"
        aria-label="Velocità di riproduzione" aria-valuemin={SPEED_MIN} aria-valuemax={SPEED_MAX}
        aria-valuenow={value} aria-valuetext={`${formatSpeed(value)}x`}
        onPointerDown={e => handleTrackPointerDown(e, trackRef, draggingRef, onChange)}
        onPointerMove={e => handleTrackPointerMove(e, trackRef, draggingRef, onChange)}
        onPointerUp={stopDrag} onPointerCancel={stopDrag}
        onKeyDown={e => handleTrackKeyDown(e, value, onChange)}
      >
        <SpeedFill pct={pct} />
      </div>
      <SpeedTicks value={value} />
    </div>
  );
}

// Un tasto -/+ di uno scatto (`SPEED_STEP`). Col dito la barra è imprecisa:
// una tacca sono ~4px, e i due tasti sono l'unico modo per centrare 1.35x
// invece di 1.3x o 1.4x.
function SpeedStepButton({ icon, ariaLabel, title, disabled, onClick }) {
  return (
    <button className="player-speed-step" onClick={onClick} disabled={disabled} aria-label={ariaLabel} title={title}>
      <span className="material-symbols-outlined">{icon}</span>
    </button>
  );
}

/**
 * Barra della velocità: trascinamento e frecce si spostano di una tacca
 * (`SPEED_STEP`) alla volta. È disegnata a mano, come quella di avanzamento,
 * per avere le etichette sotto e lo stesso aspetto dentro il player.
 */
export default function SpeedSlider({ value, onChange }) {
  const trackRef = useRef(null);
  const draggingRef = useRef(false);
  return (
    <div className="player-speed-slider">
      <SpeedStepButton
        icon="remove"
        ariaLabel={`Riduci di ${formatSpeed(SPEED_STEP)}`}
        title={`- ${formatSpeed(SPEED_STEP)}`}
        disabled={value <= SPEED_MIN}
        onClick={() => onChange(roundSpeed(value - SPEED_STEP))}
      />
      <SpeedTrack value={value} onChange={onChange} trackRef={trackRef} draggingRef={draggingRef} />
      <SpeedStepButton
        icon="add"
        ariaLabel={`Aumenta di ${formatSpeed(SPEED_STEP)}`}
        title={`+ ${formatSpeed(SPEED_STEP)}`}
        disabled={value >= SPEED_MAX}
        onClick={() => onChange(roundSpeed(value + SPEED_STEP))}
      />
    </div>
  );
}
