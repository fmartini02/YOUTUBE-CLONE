import SpeedSlider from "./SpeedSlider";
import { SPEED_PRESETS, HOLD_SPEED, formatSpeed } from "./speedMath";

// Intestazione della "finestrina" velocità: solo il bottone indietro e il
// valore corrente, isolati per restare sotto le 25 righe di SpeedPanel.
function SpeedPanelHead({ speed, onBack }) {
  return (
    <div className="player-settings-head">
      <button className="player-settings-back" onClick={onBack} aria-label="Indietro">
        <span className="material-symbols-outlined">arrow_back</span>
      </button>
      <span>Riproduzione veloce</span>
      <strong className="player-speed-current">{formatSpeed(speed)}x</strong>
    </div>
  );
}

function SpeedPresets({ speed, onSpeedChange }) {
  return (
    <>
      <div className="player-settings-label">Velocità preimpostate</div>
      <div className="player-speed-presets">
        {SPEED_PRESETS.map(s => (
          <button
            key={s}
            className={`player-speed-preset${speed === s ? " active" : ""}`}
            onClick={() => onSpeedChange(s)}
          >
            {formatSpeed(s)}x
          </button>
        ))}
      </div>
    </>
  );
}

// La "finestrina" della velocità: prende il posto dell'elenco invece di
// aprirsi accanto, che su telefono uscirebbe dallo schermo.
export default function SpeedPanel({ speed, onSpeedChange, onBack }) {
  return (
    <div className="player-speed-panel">
      <SpeedPanelHead speed={speed} onBack={onBack} />
      <SpeedSlider value={speed} onChange={onSpeedChange} />
      <SpeedPresets speed={speed} onSpeedChange={onSpeedChange} />

      {speed !== 1 && (
        <div className="player-settings-item" onClick={() => onSpeedChange(1)}>
          Torna a velocità normale
        </div>
      )}

      <div className="player-speed-hint">
        Tieni premuto sul video per andare a {formatSpeed(HOLD_SPEED)}x finché non lasci.
      </div>
    </div>
  );
}
