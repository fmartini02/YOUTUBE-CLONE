import { useState, useEffect } from "react";
import { api, formatCompact, errorMessage } from "../api";

// Legge il rating vero all'apertura (1 unità di quota), solo se l'account può
// scrivere. Torna la funzione di cleanup per useEffect.
function loadRating(videoId, canRate, setLiked) {
  setLiked(false);
  if (!canRate || !videoId) return undefined;
  let annullato = false;
  api.videoRating(videoId)
    .then(d => { if (!annullato) setLiked(d?.rating === "like"); })
    .catch(() => {});
  return () => { annullato = true; };
}

async function toggleRating(videoId, liked, setLiked, setBusy, onNotice) {
  setBusy(true);
  const next = liked ? "none" : "like";
  try {
    await api.rateVideo(videoId, next);
    setLiked(next === "like");
  } catch (e) {
    onNotice?.(errorMessage(e, "Operazione non riuscita"));
  } finally {
    setBusy(false);
  }
}

function ReadOnlyLikes({ likes }) {
  if (!likes) return null;
  return <span className="action-btn" style={{ cursor: "default" }}>👍 {formatCompact(likes)}</span>;
}

/**
 * "Mi piace" a un video. Serve l'account Google con scope di scrittura (lo
 * stesso di commenti e iscrizioni): senza, `canRate` è falso e resta il
 * conteggio in sola lettura di prima. Il conteggio mostrato è quello di
 * YouTube + 1 se in questa sessione si è messo "mi piace" (stima ottimistica,
 * come fa YouTube stesso finché non ricarichi).
 */
export default function LikeButton({ videoId, likes, canRate, onNotice }) {
  const [liked, setLiked] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => loadRating(videoId, canRate, setLiked), [videoId, canRate]);

  if (!canRate) return <ReadOnlyLikes likes={likes} />;

  const count = (likes || 0) + (liked ? 1 : 0);
  return (
    <button
      className={`action-btn${liked ? " primary" : ""}`}
      onClick={() => !busy && toggleRating(videoId, liked, setLiked, setBusy, onNotice)}
      disabled={busy}
      title={liked ? "Togli mi piace" : "Mi piace"}
    >
      👍 {formatCompact(count)}
    </button>
  );
}
