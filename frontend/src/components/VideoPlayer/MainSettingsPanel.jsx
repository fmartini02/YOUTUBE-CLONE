import { formatSpeed } from "./speedMath";
import { labelForHeight } from "./videoPlayerHelpers";
import SubtitlesSection from "./SubtitlesSection";

const QUALITIES = [["best", "Migliore qualità"], ["2160", "2160p (4K)"], ["1440", "1440p"], ["1080", "1080p"], ["720", "720p"], ["480", "480p"], ["360", "360p"]];
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

// Con "best" attivo non si vede altrimenti QUALE definizione sta arrivando
// (non è una scelta dell'utente): la riga mostra anche l'altezza reale
// decodificata, come "Automatica (1080p)" di YouTube. Le altre voci sono già
// esplicite (l'utente le ha scelte lui), quindi restano senza etichetta.
function QualitySection({ quality, onPickQuality, actualHeight }) {
  const label = quality === "best" ? labelForHeight(actualHeight) : "";
  return (
    <div className="player-settings-section">
      <div className="player-settings-label">Qualità</div>
      {QUALITIES.map(([v, l]) => (
        <div
          key={v}
          className={`player-settings-item${v === "best" && label ? " player-settings-row" : ""}${quality === v ? " active" : ""}`}
          onClick={() => onPickQuality(v)}
        >
          <span>{l}</span>
          {v === "best" && label && <span className="player-settings-value">{label}</span>}
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
  // subtitleLang/subtitleLangs/onSubtitleLangChange/onClose/subtitleSize/
  // onSubtitleSizeChange restano fra i props ricevuti (non tocco la firma dei
  // chiamanti) ma non sono più usati qui sotto: la sezione che li usava è
  // commentata, non cancellata (vedi nota più sotto).
  const { speed, onGoSpeed, quality, onPickQuality, actualHeight } = props;
  return (
    <>
      <PlaybackSection speed={speed} onGoSpeed={onGoSpeed} />
      <QualitySection quality={quality} onPickQuality={onPickQuality} actualHeight={actualHeight} />
      {/* Sezione "Sottotitoli" tolta dal menu impostazioni su richiesta: il
          controllo resta comunque disponibile dal tasto CC nella barra
          (PlayerButtonsBar) e dalla scorciatoia "c". Codice non cancellato,
          solo commentato, per poterlo riattivare senza ricostruirlo. */}
      {/* <SubtitlesSection
        subtitleLang={subtitleLang}
        subtitleLangs={subtitleLangs}
        onSubtitleLangChange={onSubtitleLangChange}
        onClose={onClose}
      />
      {subtitleLang && <SubtitleSizeSection subtitleSize={subtitleSize} onSubtitleSizeChange={onSubtitleSizeChange} />} */}
    </>
  );
}
