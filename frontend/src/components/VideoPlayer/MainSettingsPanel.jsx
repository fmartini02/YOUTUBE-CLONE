import { formatSpeed } from "./speedMath";
import SubtitlesSection from "./SubtitlesSection";

const QUALITIES = [["best", "Migliore qualità"], ["1080", "1080p"], ["720", "720p"], ["480", "480p"], ["360", "360p"]];
const SUB_SIZES = [["small", "Piccoli"], ["normal", "Normali"], ["large", "Grandi"]];

function PlaybackSection({ speed, onGoSpeed }) {
  return (
    <div className="player-settings-section">
      <div className="player-settings-label">Riproduzione</div>
      <div className="player-settings-item player-settings-row" onClick={onGoSpeed}>
        <span>Riproduzione veloce</span>
        <span className="player-settings-value">
          {formatSpeed(speed)}x
          <span className="material-symbols-outlined">chevron_right</span>
        </span>
      </div>
    </div>
  );
}

function QualitySection({ quality, onPickQuality }) {
  return (
    <div className="player-settings-section">
      <div className="player-settings-label">Qualità</div>
      {QUALITIES.map(([v, l]) => (
        <div key={v} className={`player-settings-item${quality === v ? " active" : ""}`} onClick={() => onPickQuality(v)}>
          {l}
        </div>
      ))}
    </div>
  );
}

function SubtitleSizeSection({ subtitleSize, onSubtitleSizeChange }) {
  return (
    <div className="player-settings-section">
      <div className="player-settings-label">Dimensione sottotitoli</div>
      {SUB_SIZES.map(([v, l]) => (
        <div key={v} className={`player-settings-item${subtitleSize === v ? " active" : ""}`} onClick={() => onSubtitleSizeChange(v)}>
          {l}
        </div>
      ))}
    </div>
  );
}

// Elenco principale del menu impostazioni: le quattro sezioni, ognuna isolata
// perché insieme superavano abbondantemente le 25 righe.
export default function MainSettingsPanel(props) {
  const { speed, onGoSpeed, quality, onPickQuality, subtitleLang, subtitleLangs, onSubtitleLangChange, onClose, subtitleSize, onSubtitleSizeChange } = props;
  return (
    <>
      <PlaybackSection speed={speed} onGoSpeed={onGoSpeed} />
      <QualitySection quality={quality} onPickQuality={onPickQuality} />
      <SubtitlesSection
        subtitleLang={subtitleLang}
        subtitleLangs={subtitleLangs}
        onSubtitleLangChange={onSubtitleLangChange}
        onClose={onClose}
      />
      {subtitleLang && <SubtitleSizeSection subtitleSize={subtitleSize} onSubtitleSizeChange={onSubtitleSizeChange} />}
    </>
  );
}
