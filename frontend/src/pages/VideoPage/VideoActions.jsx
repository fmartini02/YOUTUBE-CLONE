import LikeButton from "../../components/LikeButton";
import { useWatchLaterToggle } from "../../hooks/useWatchLater";

// Icona in un cerchio con l'etichetta sotto, come la striscia di comandi
// dell'app YouTube. Non è un `action-btn`: lì il testo sta accanto all'icona e
// ogni voce si porta via mezza riga.
function ActionIcon({ icon, label, onClick }) {
  return (
    <button className="action-icon" onClick={onClick} title={label}>
      <span className="action-icon-circle">
        <span className="material-symbols-outlined">{icon}</span>
      </span>
      <span className="action-icon-label">{label}</span>
    </button>
  );
}

/**
 * Comparsa solo mentre si sta trasmettendo, ed è l'unico modo di fermare la
 * TV: durante il cast il player non è montato (al suo posto c'è la schermata
 * di stato o il telecomando), quindi l'icona Cast nella barra dei comandi del
 * player — dove sta il resto del tempo — in quel momento non esiste.
 */
function StopCastPill({ cast }) {
  return (
    <button
      className="action-btn"
      onClick={() => cast.stopCast()}
      title={`Interrompi la trasmissione su ${cast.deviceName || "TV"}`}
    >
      ⏹ Interrompi
    </button>
  );
}

/** Riga di azioni sotto il titolo: "mi piace", salva per dopo, condividi, scarica. */
export default function VideoActions({ info, addToast, onDownload, videoId, canRate, cast, isCasting }) {
  // "Salva" = coda locale "Guarda più tardi" (nessun account): i metadati
  // vanno con il video, così la coda si mostra senza richiederli a YouTube.
  const [salvato, toggleSalva] = useWatchLaterToggle({ ...info, id: videoId }, addToast);
  const condividi = () => {
    navigator.clipboard?.writeText(`https://youtube.com/watch?v=${videoId}`);
    addToast("Link copiato!");
  };

  return (
    <div className="video-actions">
      <LikeButton videoId={videoId} likes={info.likes} canRate={canRate} onNotice={addToast} />
      {isCasting && <StopCastPill cast={cast} />}
      <div className="video-actions-icons">
        <ActionIcon icon={salvato ? "check" : "watch_later"} label={salvato ? "Salvato" : "Salva"} onClick={toggleSalva} />
        <ActionIcon icon="share" label="Condividi" onClick={condividi} />
        <ActionIcon icon="download" label="Scarica" onClick={onDownload} />
      </div>
    </div>
  );
}
