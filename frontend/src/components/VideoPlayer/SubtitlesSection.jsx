function SubtitleLangList({ subtitleLang, subtitleLangs, onSubtitleLangChange, onClose }) {
  if (subtitleLangs.length === 0) {
    return (
      <div className="player-settings-item" style={{ color: "var(--text3)", cursor: "default" }}>
        Nessun sottotitolo disponibile
      </div>
    );
  }
  return subtitleLangs.map(l => (
    <div
      key={l.code}
      className={`player-settings-item${subtitleLang === l.code ? " active" : ""}`}
      onClick={() => { onSubtitleLangChange(l.code); onClose(); }}
    >
      {l.name}{l.auto ? " (auto)" : ""}
    </div>
  ));
}

function SubtitleOptions(props) {
  const { subtitleLang, onSubtitleLangChange, onClose } = props;
  return (
    <>
      <div
        className={`player-settings-item${!subtitleLang ? " active" : ""}`}
        onClick={() => { onSubtitleLangChange(""); onClose(); }}
      >
        Off
      </div>
      <SubtitleLangList {...props} />
    </>
  );
}

export default function SubtitlesSection(props) {
  return (
    <div className="player-settings-section">
      <div className="player-settings-label">Sottotitoli</div>
      <SubtitleOptions {...props} />
    </div>
  );
}
