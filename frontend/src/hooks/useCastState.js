import { useState } from "react";

/** I 7 pezzi di stato di useCast, raggruppati per non far superare a useCast le 25 righe. */
export function useCastState() {
  const [available, setAvailable] = useState(false);
  const [unavailableReason, setUnavailableReason] = useState(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [playerState, setPlayerState] = useState("idle");
  const [castingVideoId, setCastingVideoId] = useState(null);

  return {
    state: { available, unavailableReason, connected, connecting, deviceName, playerState, castingVideoId },
    setters: {
      setAvailable, setUnavailableReason, setConnected, setConnecting,
      setDeviceName, setPlayerState, setCastingVideoId,
    },
  };
}
