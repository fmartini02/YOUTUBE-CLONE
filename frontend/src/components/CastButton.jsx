import { useState } from "react";
import { isCastableOrigin } from "../api";
import { CAST_UNAVAILABLE_MESSAGE, CAST_ERROR_MESSAGE } from "../hooks/useCast.jsx";

/**
 * CastButton — l'UNICO comando Chromecast dell'app.
 *
 * Un solo bottone con quattro stati: trasmetti / connessione in corso /
 * interrompi / non disponibile. Non si nasconde mai quando il cast non è
 * disponibile: cliccandolo spiega il motivo, che è più utile di un bottone
 * che sparisce senza dire niente.
 *
 * `media` è il video da mandare in TV: { streamUrl, title, channel,
 * thumbnail, duration, videoId }.
 */
export default function CastButton({ cast, media, onNotice }) {
  const [busy, setBusy] = useState(false);

  const casting = !!cast?.connected && cast.castingVideoId === media?.videoId;
  const connecting = !!cast?.connecting || busy;

  async function handleClick() {
    if (!cast?.available) {
      onNotice?.(CAST_UNAVAILABLE_MESSAGE[cast?.unavailableReason] || CAST_ERROR_MESSAGE.unavailable);
      return;
    }
    if (casting) {
      cast.stopCast();
      return;
    }
    // Il Chromecast scarica il video da sé: se la pagina è aperta su
    // localhost, l'URL che gli passeremmo punterebbe alla TV stessa.
    if (!isCastableOrigin()) {
      onNotice?.("Per trasmettere apri YTProxy dall'IP di rete (es. http://192.168.1.11:8090), non da localhost");
      return;
    }
    if (!media?.videoId || busy) return;

    setBusy(true);
    try {
      const { ok, error } = await cast.startCast(media);
      if (ok) onNotice?.(`📺 In riproduzione su ${cast.deviceName || "TV"}`);
      else if (error !== "cancel") onNotice?.(CAST_ERROR_MESSAGE[error] || CAST_ERROR_MESSAGE.load);
    } finally {
      setBusy(false);
    }
  }

  const label = !cast?.available ? "Trasmetti sulla TV"
    : connecting ? "Connessione…"
    : casting ? `Interrompi (${cast.deviceName || "TV"})`
    : "Trasmetti sulla TV";

  return (
    <button
      className={`action-btn${casting || !cast?.available ? "" : " primary"}`}
      style={cast?.available ? undefined : { opacity: 0.6 }}
      onClick={handleClick}
      title={casting ? `In riproduzione su ${cast.deviceName}` : "Trasmetti su Chromecast"}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 6 }}>
        {casting ? (
          <path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11zm18-3H5c-1.1 0-2 .9-2 2v1.17c3.55 1.03 6.35 3.83 7.38 7.38H19V9h-9V7h9v10h2V9c0-1.1-.9-2-2-2z" />
        ) : (
          <path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm18-7H5c-1.1 0-2 .9-2 2v3h2v-3h14v10h-5v2h5c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zM1 10v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11z" />
        )}
      </svg>
      {label}
    </button>
  );
}
