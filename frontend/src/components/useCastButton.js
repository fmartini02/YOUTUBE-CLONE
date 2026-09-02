import { useState } from "react";
import { resolveCastBase } from "../api";
import { CAST_UNAVAILABLE_MESSAGE, CAST_ERROR_MESSAGE } from "../hooks/useCast.jsx";

// Avvia la trasmissione: riscrive l'origine dello stream con l'indirizzo di
// rete del server (un URL su localhost punterebbe alla TV stessa) e passa il
// tutto al backend Cast. I messaggi sono gli stessi del bottone testuale.
async function startCasting(cast, media, onNotice) {
  const base = await resolveCastBase();
  if (!base) {
    onNotice?.("Non riesco a ricavare l'indirizzo di rete del server: apri YTProxy dall'IP della LAN (es. http://192.168.1.11:8090) per trasmettere.");
    return;
  }
  const streamUrl = media.streamUrl.replace(/^https?:\/\/[^/]+/, base);
  const { ok, error } = await cast.startCast({ ...media, streamUrl });
  if (ok) onNotice?.(`📺 In riproduzione su ${cast.deviceName || "TV"}`);
  else if (error !== "cancel") onNotice?.(CAST_ERROR_MESSAGE[error] || CAST_ERROR_MESSAGE.load);
}

/**
 * Stato + azione condivisi dai due bottoni Chromecast: quello testuale sotto il
 * video (`components/CastButton.jsx`) e quello a icona nella barra del player
 * (`components/VideoPlayer/PlayerCastButton.jsx`). Un solo comportamento, così
 * il secondo bottone "funziona esattamente come" il primo per costruzione.
 *
 * Quattro stati: trasmetti / connessione in corso / interrompi / non
 * disponibile. Non disponibile non nasconde il bottone: cliccandolo spiega il
 * motivo, come per il bottone testuale.
 *
 * `media` è il video da mandare in TV: { streamUrl, title, channel, thumbnail,
 * duration, videoId }.
 */
export function useCastButton(cast, media, onNotice) {
  const [busy, setBusy] = useState(false);
  const casting = !!cast?.connected && cast.castingVideoId === media?.videoId;
  const connecting = !!cast?.connecting || busy;

  async function onClick() {
    if (!cast?.available) {
      onNotice?.(CAST_UNAVAILABLE_MESSAGE[cast?.unavailableReason] || CAST_ERROR_MESSAGE.unavailable);
      return;
    }
    if (casting) { cast.stopCast(); return; }
    if (!media?.videoId || busy) return;
    setBusy(true);
    try { await startCasting(cast, media, onNotice); }
    finally { setBusy(false); }
  }

  return { casting, connecting, available: !!cast?.available, deviceName: cast?.deviceName, onClick };
}
