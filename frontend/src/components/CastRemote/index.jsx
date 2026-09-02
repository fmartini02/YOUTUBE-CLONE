import { useCallback } from "react";
import CastRemoteScreen from "./CastRemoteScreen";
import CastRemoteBar from "./CastRemoteBar";
import CastRemoteSettings from "./CastRemoteSettings";
import CastRemoteQueue from "./CastRemoteQueue";

/**
 * Telecomando del cast — al posto del player locale quando il video sta
 * girando sulla TV dall'APK Android. Comanda la sessione Cast nativa via
 * `cast.remote` (hooks/nativeCast.js): play/pausa, seek con barra, ±10s,
 * doppio tocco, e — dal menu ⚙ — qualità, sottotitoli e velocità (ricaricano
 * il video sulla TV alla posizione corrente).
 *
 * Sul cast web desktop `cast.remote` è null e resta CastingScreen ("manda e
 * basta", si comanda dal telecomando della TV) — vedi VideoMainPlayer.
 */
export default function CastRemote({ cast, player, info }) {
  const { remote } = cast;
  const media = player.castMedia;
  const duration = cast.duration || media?.duration || 0;
  const playing = cast.playerState === "playing";
  const togglePlay = useCallback(() => (playing ? remote.pause() : remote.play()), [remote, playing]);

  // .player-wrap è già position:relative + overflow:hidden: il menu ⚙ e il suo
  // backdrop (.player-settings-*, position:absolute) si ancorano lì, come nel
  // player locale, e `bottom:62px` del menu scavalca la barra qui sotto.
  return (
    <div className="player-wrap">
      <CastRemoteScreen
        thumbnail={info?.thumbnail || media?.thumbnail} deviceName={cast.deviceName}
        playerState={cast.playerState} onSkip={remote.skip} onTogglePlay={togglePlay}
      />
      <CastRemoteSettings cast={cast} player={player} />
      <CastRemoteBar
        position={cast.position || 0} duration={duration} playing={playing}
        onSeek={remote.seek} onSkip={remote.skip} onTogglePlay={togglePlay}
      />
      <CastRemoteQueue queue={cast.queue} onNext={remote.queueNext} onPrev={remote.queuePrev} />
    </div>
  );
}
