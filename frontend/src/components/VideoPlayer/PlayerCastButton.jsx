import { useCastButton } from "../useCastButton";

/**
 * Bottone Chromecast a icona nella barra dei comandi del player. Vive dentro
 * `.player-wrap`, che è l'elemento che va a schermo intero: così è visibile sia
 * a finestra sia a schermo intero, dove la riga con il CastButton testuale non
 * arriva.
 *
 * Comportamento identico a `components/CastButton.jsx`: entrambi passano da
 * `useCastButton`. Icona `cast` / `cast_connected` delle Material Symbols, per
 * restare in linea con gli altri tasti della barra (settings, closed_caption,
 * fullscreen); il font impacchettato è quello completo, i due glifi ci sono.
 */
export default function PlayerCastButton({ cast, media, onNotice }) {
  const { casting, connecting, available, deviceName, onClick } = useCastButton(cast, media, onNotice);

  const title = !available ? "Trasmetti su Chromecast (non disponibile)"
    : connecting ? "Connessione…"
    : casting ? `Interrompi (${deviceName || "TV"})`
    : "Trasmetti su Chromecast";

  return (
    <button
      className={`player-btn${casting ? " on" : ""}`}
      style={available ? undefined : { opacity: 0.6 }}
      onClick={onClick}
      title={title}
    >
      <span className="material-symbols-outlined">{casting ? "cast_connected" : "cast"}</span>
    </button>
  );
}
