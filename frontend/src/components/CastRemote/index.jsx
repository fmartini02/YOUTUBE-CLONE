import { useCallback } from "react";
import CastRemoteScreen from "./CastRemoteScreen";
import CastRemoteBar from "./CastRemoteBar";

/**
 * Telecomando del cast — al posto del player locale quando il video sta
 * girando sulla TV dall'APK Android. Comanda la sessione Cast nativa via
 * `cast.remote` (hooks/nativeCast.js): play/pausa, seek con barra, ±10s,
 * doppio tocco. Qualità, sottotitoli e coda arrivano nelle fasi successive.
 *
 * Sul cast web desktop `cast.remote` è null e resta CastingScreen ("manda e
 * basta", si comanda dal telecomando della TV) — vedi VideoMainPlayer.
 */
export default function CastRemote({ cast, media, info }) {
  const { remote } = cast;
  const duration = cast.duration || media?.duration || 0;
  const playing = cast.playerState === "playing";
  const togglePlay = useCallback(() => (playing ? remote.pause() : remote.play()), [remote, playing]);

  return (
    <div className="player-wrap">
      <CastRemoteScreen
        thumbnail={info?.thumbnail || media?.thumbnail} deviceName={cast.deviceName}
        playerState={cast.playerState} onSkip={remote.skip} onTogglePlay={togglePlay}
      />
      <CastRemoteBar
        position={cast.position || 0} duration={duration} playing={playing}
        onSeek={remote.seek} onSkip={remote.skip} onTogglePlay={togglePlay}
      />
    </div>
  );
}
