import { useEffect, useRef, useState } from "react";
import { useCastState } from "./useCastState";
import { YtCast, nativeStartCast, nativeLoadPayload, subscribeCast } from "./nativeCastBridge";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Lo snapshot che il plugin manda (connesso?, nome TV, stato del media) →
// stato React. `media` tiene posizione/durata/velocità, che servono di
// continuo alla barra del telecomando e cambiano ~1 volta al secondo.
function applySnapshot(s, setters, setMedia) {
  if (!s) return;
  const connected = !!s.connected;
  setters.setConnected(connected);
  setters.setConnecting(s.phase === "connecting");
  setters.setDeviceName(s.deviceName || "");
  setters.setAvailable(true);
  setters.setPlayerState(s.playerState || "idle");
  setters.setCastingVideoId(connected ? s.videoId || null : null);
  setMedia((prev) => ({
    position: s.position ?? prev.position,
    duration: s.duration ?? prev.duration,
    playbackRate: s.playbackRate ?? prev.playbackRate,
  }));
}

// Il telecomando vero e proprio: le azioni che CastRemote chiama. seek/skip
// fanno i conti sulla posizione corrente letta da mediaRef (sempre fresca).
function buildRemote(mediaRef) {
  const cur = () => mediaRef.current;
  const target = (t) => clamp(t, 0, cur().duration || t || 0);
  return {
    play: () => YtCast.play(),
    pause: () => YtCast.pause(),
    seek: (t) => YtCast.seek({ time: target(t) }),
    skip: (d) => YtCast.seek({ time: target((cur().position || 0) + d) }),
    setRate: (rate) => YtCast.setPlaybackRate({ rate }),
    reload: (media, at) => YtCast.loadMedia(nativeLoadPayload(media, at ?? cur().position ?? 0)),
  };
}

/**
 * Ramo nativo di useCast — l'APK Android, dove il Cast Web Sender di Google non
 * esiste. Oltre all'interfaccia di useWebCast espone `remote` (telecomando
 * completo) e i campi `position`/`duration`/`playbackRate` per la barra.
 */
export function useNativeCast() {
  const { state, setters } = useCastState();
  const [media, setMedia] = useState({ position: 0, duration: 0, playbackRate: 1 });
  const mediaRef = useRef(media);
  mediaRef.current = media;
  const remoteRef = useRef(null);
  if (!remoteRef.current) remoteRef.current = buildRemote(mediaRef);

  useEffect(() => {
    const on = (s) => applySnapshot(s, setters, setMedia);
    YtCast.isAvailable().then((r) => setters.setAvailable(!!r?.available)).catch(() => {});
    YtCast.getState().then(on).catch(() => {});
    return subscribeCast(on, on);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- setters/YtCast stabili

  return {
    ...state,
    position: media.position,
    duration: media.duration,
    playbackRate: media.playbackRate,
    remote: remoteRef.current,
    startCast: nativeStartCast,
    stopCast: () => YtCast.endSession(),
  };
}
