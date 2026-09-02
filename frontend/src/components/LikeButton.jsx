import { useState, useEffect } from "react";
import { api, formatCompact, errorMessage } from "../api";

// Legge il rating vero all'apertura (1 unità di quota), solo se l'account può
// scrivere. `liked` e `initialLiked` partono uguali: il conteggio si corregge
// solo per il DELTA di questa sessione, non per un "mi piace" già conteggiato
// da YouTube in `likes`. Torna la funzione di cleanup per useEffect.
function loadRating(videoId, canRate, setRating) {
  setRating({ liked: false, initialLiked: false });
  if (!canRate || !videoId) return undefined;
  let annullato = false;
  api.videoRating(videoId)
    .then(d => {
      if (annullato) return;
      const l = d?.rating === "like";
      setRating({ liked: l, initialLiked: l });
    })
    .catch(() => {});
  return () => { annullato = true; };
}

async function toggleRating(videoId, liked, setRating, setBusy, onNotice) {
  setBusy(true);
  const next = liked ? "none" : "like";
  try {
    await api.rateVideo(videoId, next);
    setRating(r => ({ ...r, liked: next === "like" }));
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
 * conteggio in sola lettura di prima.
 *
 * `likes` (da YouTube) contiene GIÀ l'eventuale "mi piace" dell'utente messo in
 * precedenza, quindi il conteggio mostrato aggiunge +1 solo se in questa
 * sessione si è passati da "non mi piace" a "mi piace" (e -1 nel caso opposto)
 * — stima ottimistica finché non si ricarica, come fa YouTube stesso.
 */
export default function LikeButton({ videoId, likes, canRate, onNotice }) {
  const [rating, setRating] = useState({ liked: false, initialLiked: false });
  const [busy, setBusy] = useState(false);

  useEffect(() => loadRating(videoId, canRate, setRating), [videoId, canRate]);

  if (!canRate) return <ReadOnlyLikes likes={likes} />;

  const { liked, initialLiked } = rating;
  const count = (likes || 0) + (liked ? 1 : 0) - (initialLiked ? 1 : 0);
  return (
    <button
      className={`action-btn${liked ? " primary" : ""}`}
      onClick={() => !busy && toggleRating(videoId, liked, setRating, setBusy, onNotice)}
      disabled={busy}
      title={liked ? "Togli mi piace" : "Mi piace"}
    >
      👍 {formatCompact(count < 0 ? 0 : count)}
    </button>
  );
}
