import VideoPlayer from "../../components/VideoPlayer";
import CastingScreen from "./CastingScreen";
import CastRemote from "../../components/CastRemote";

// Solo in cast c'è qualcosa di vero da dire ("sta girando su quella TV").
// Un video normale non è una diretta: mostrare "Streaming diretto" sempre,
// come prima, era fuorviante — quindi qui sotto non c'è nessun fallback.
function PlayerControlsBar({ isCasting, cast }) {
  if (!isCasting) return null;
  return (
    <div className="player-controls">
      <span style={{ fontSize: 12, color: "var(--text3)", marginLeft: "auto" }}>
        📺 {cast.deviceName}
      </span>
    </div>
  );
}

/**
 * Il player vero, o — quando il video sta girando sulla TV — il telecomando
 * (APK Android, `cast.remote` presente) oppure la sola schermata di stato
 * (cast web desktop, che si comanda dal telecomando della TV).
 */
function PlayerOrCasting({ isCasting, cast, info, player }) {
  if (isCasting && cast?.remote) return <CastRemote cast={cast} media={player.castMedia} info={info} />;
  if (isCasting) return <CastingScreen cast={cast} thumbnail={info?.thumbnail} />;
  return (
    <VideoPlayer
      videoId={player.videoId} quality={player.quality} onQualityChange={player.cambiaQualita} duration={info?.duration}
      subtitleLangs={player.subtitleLangs} subtitleLang={player.subtitleLang} onSubtitleLangChange={player.setSubtitleLang}
      subtitleSize={player.subtitleSize} onSubtitleSizeChange={player.setSubtitleSize}
      theater={player.theater} onToggleTheater={player.toggleTheater}
      onError={() => player.addToast("Errore stream — ricarica la pagina")} onNotice={player.addToast}
      autoplay={player.autoplay} fitScreen={player.fitScreen}
    />
  );
}

/**
 * Player / stato del cast + la riga sotto che dice come sta girando il video.
 * Il player non aspetta i metadati: l'URL del flusso si costruisce subito da
 * videoId+quality. La durata arriva dopo, con /api/watch, e serve solo alla
 * barra di avanzamento.
 */
export default function VideoMainPlayer({
  isCasting, cast, videoId, quality, cambiaQualita, info, subtitleLang, setSubtitleLang, subtitleLangs,
  subtitleSize, setSubtitleSize, theater, toggleTheater, addToast, autoplay, fitScreen, castMedia,
}) {
  const player = {
    videoId, quality, cambiaQualita, subtitleLang, setSubtitleLang, subtitleLangs, castMedia,
    subtitleSize, setSubtitleSize, theater, toggleTheater, addToast, autoplay, fitScreen,
  };
  return (
    <>
      <PlayerOrCasting isCasting={isCasting} cast={cast} info={info} player={player} />
      <PlayerControlsBar isCasting={isCasting} cast={cast} />
    </>
  );
}
