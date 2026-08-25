import { useState, useRef, useEffect, useCallback } from "react";

/**
 * Qualità video: parte da "best", si applica la preferenza salvata sul
 * server non appena arriva, ma mai sopra una scelta fatta a mano dal menu
 * del player — quella vale fino a fine sessione, come su YouTube.
 */
export function useVideoQuality(prefsPronte, prefQuality) {
  const [quality, setQuality] = useState("best");
  const qualitaScelta = useRef(false);

  useEffect(() => {
    if (!prefsPronte || qualitaScelta.current) return;
    if (prefQuality) setQuality(prefQuality);
  }, [prefsPronte, prefQuality]);

  const cambiaQualita = useCallback((q) => {
    qualitaScelta.current = true;
    setQuality(q);
  }, []);

  return [quality, cambiaQualita];
}
