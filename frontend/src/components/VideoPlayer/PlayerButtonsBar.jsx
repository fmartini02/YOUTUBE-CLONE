import { formatTime } from "./videoPlayerHelpers";
import { formatSpeed } from "./speedMath";
import { SKIP_SECONDS } from "./playerConstants";
import { isCapacitor } from "../../api/device";

function VolumeControl({ muted, volume, toggleMute, changeVolume }) {
  return (
    <div className="player-volume">
      <button className="player-btn" onClick={toggleMute} title={muted ? "Riattiva audio (m)" : "Disattiva audio (m)"}>
        <span className="material-symbols-outlined">
          {muted || volume === 0 ? "volume_off" : volume < 0.5 ? "volume_down" : "volume_up"}
        </span>
      </button>
      <input
        className="player-volume-slider"
        type="range" min="0" max="1" step="0.05"
        value={muted ? 0 : volume}
        onChange={e => changeVolume(Number(e.target.value))}
        aria-label="Volume"
      />
    </div>
  );
}

function SettingsButton({ settingsOpen, onOpenSettings, speed }) {
  return (
    <button className={`player-btn player-settings-btn${settingsOpen ? " on" : ""}`} onClick={onOpenSettings} title="Impostazioni">
      <span className="material-symbols-outlined">settings</span>
      {/* La velocità non si vede da nessun'altra parte a menu chiuso: senza
          questa targhetta ci si dimentica il video a 2x. */}
      {speed !== 1 && <span className="player-speed-badge">{formatSpeed(speed)}x</span>}
    </button>
  );
}

// Icona disegnata a mano: il rettangolo largo/stretto della modalità cinema
// non ha un equivalente affidabile fra le Material Symbols.
//
// Nell'app installata (Capacitor) il tasto non compare: la modalità cinema
// allarga il video accanto alla sidebar dei correlati, un layout che sul
// telefono è già a colonna singola — lì lo switch non ha nessun effetto utile
// da mostrare. Resta su web/desktop, dove quel layout affiancato esiste
// davvero. `isCapacitor()` è una scelta a runtime, non a build: nello stesso
// bundle servito sia al sito sia impacchettato nell'APK.
function TheaterButton({ theater, onToggleTheater }) {
  if (isCapacitor()) return null;
  return (
    <button className="player-btn" onClick={() => onToggleTheater?.()} title={theater ? "Modalità predefinita (t)" : "Modalità cinema (t)"}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        {theater ? <rect x="6" y="7" width="12" height="10" rx="1.5" /> : <rect x="2.5" y="6" width="19" height="12" rx="1.5" />}
      </svg>
    </button>
  );
}

function RightControls(props) {
  const { subtitleLang, toggleSubtitles, fullscreen, toggleFullscreen } = props;
  return (
    <div className="player-buttons-right">
      <button
        className={`player-btn${subtitleLang ? " on" : ""}`}
        onClick={toggleSubtitles}
        title={subtitleLang ? "Disattiva sottotitoli (c)" : "Attiva sottotitoli (c)"}
      >
        <span className="material-symbols-outlined">closed_caption</span>
      </button>
      <SettingsButton settingsOpen={props.settingsOpen} onOpenSettings={props.onOpenSettings} speed={props.speed} />
      <TheaterButton theater={props.theater} onToggleTheater={props.onToggleTheater} />
      <button className="player-btn" onClick={toggleFullscreen} title={fullscreen ? "Esci da schermo intero (f)" : "Schermo intero (f)"}>
        <span className="material-symbols-outlined">{fullscreen ? "fullscreen_exit" : "fullscreen"}</span>
      </button>
    </div>
  );
}

// Fila di pulsanti sotto la barra di avanzamento. Puramente presentazionale:
// stato e callback restano nel VideoPlayer.
export default function PlayerButtonsBar(props) {
  const { playing, togglePlay, skip, shown, duration } = props;
  const { muted, volume, toggleMute, changeVolume } = props;
  const { subtitleLang, toggleSubtitles, settingsOpen, onOpenSettings, speed, theater, onToggleTheater, fullscreen, toggleFullscreen } = props;
  const rightProps = { subtitleLang, toggleSubtitles, settingsOpen, onOpenSettings, speed, theater, onToggleTheater, fullscreen, toggleFullscreen };
  return (
    <div className="player-buttons">
      <button className="player-btn" onClick={togglePlay} title={playing ? "Pausa (k)" : "Riproduci (k)"}>
        <span className="material-symbols-outlined">{playing ? "pause" : "play_arrow"}</span>
      </button>

      <button className="player-btn" onClick={() => skip(-SKIP_SECONDS)} title="Indietro di 10 secondi (←)">
        <span className="material-symbols-outlined">replay_10</span>
      </button>
      <button className="player-btn" onClick={() => skip(SKIP_SECONDS)} title="Avanti di 10 secondi (→)">
        <span className="material-symbols-outlined">forward_10</span>
      </button>

      <VolumeControl muted={muted} volume={volume} toggleMute={toggleMute} changeVolume={changeVolume} />

      <span className="player-time">
        {formatTime(shown)} / {duration ? formatTime(duration) : "--:--"}
      </span>

      <RightControls {...rightProps} />
    </div>
  );
}
