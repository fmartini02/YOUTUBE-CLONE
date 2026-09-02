import { useCastButton } from "./useCastButton";

function CastIcon({ casting }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 6 }}>
      {casting ? (
        <path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11zm18-3H5c-1.1 0-2 .9-2 2v1.17c3.55 1.03 6.35 3.83 7.38 7.38H19V9h-9V7h9v10h2V9c0-1.1-.9-2-2-2z" />
      ) : (
        <path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm18-7H5c-1.1 0-2 .9-2 2v3h2v-3h14v10h-5v2h5c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zM1 10v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11z" />
      )}
    </svg>
  );
}

/**
 * CastButton — il comando Chromecast testuale, sotto il video (riga del canale).
 *
 * Un solo bottone con quattro stati: trasmetti / connessione in corso /
 * interrompi / non disponibile. Non si nasconde mai quando il cast non è
 * disponibile: cliccandolo spiega il motivo, che è più utile di un bottone
 * che sparisce senza dire niente.
 *
 * Il gemello a icona nella barra del player (`VideoPlayer/PlayerCastButton.jsx`)
 * condivide con questo l'hook `useCastButton`, quindi si comporta allo stesso
 * modo — è visibile anche a schermo intero, dove questa riga non arriva.
 *
 * `media` è il video da mandare in TV: { streamUrl, title, channel,
 * thumbnail, duration, videoId }.
 */
export default function CastButton({ cast, media, onNotice }) {
  const { casting, connecting, available, deviceName, onClick } = useCastButton(cast, media, onNotice);

  const label = !available ? "Trasmetti sulla TV"
    : connecting ? "Connessione…"
    : casting ? `Interrompi (${deviceName || "TV"})`
    : "Trasmetti sulla TV";

  return (
    <button
      className={`action-btn${casting || !available ? "" : " primary"}`}
      style={available ? undefined : { opacity: 0.6 }}
      onClick={onClick}
      title={casting ? `In riproduzione su ${deviceName}` : "Trasmetti su Chromecast"}
    >
      <CastIcon casting={casting} />
      {label}
    </button>
  );
}
