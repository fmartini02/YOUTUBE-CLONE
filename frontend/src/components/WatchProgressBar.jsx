import { usePrefs } from "../hooks/usePrefs";
import { useWatchProgress } from "../hooks/useWatchProgress";

// Negli ultimi secondi il video conta come visto per intero: barretta piena,
// come su YouTube. Stesso margine di RESUME_END_MARGIN_S in server/auth/config.py,
// dove lo stesso video riaperto riparte da 0.
const FINE_MARGINE_S = 10;

/**
 * Percentuale vista di un video, o null se non c'è niente da mostrare: nessuna
 * posizione salvata, durata sconosciuta (senza non c'è proporzione), o meno
 * dell'1% — un video aperto e chiuso subito non merita la barretta.
 */
function percentualeVista(p) {
  if (!p?.position || !p.duration) return null;
  if (p.position >= p.duration - FINE_MARGINE_S) return 100;
  const pct = (p.position / p.duration) * 100;
  return pct >= 1 ? Math.min(100, pct) : null;
}

/**
 * La barretta rossa in fondo alla miniatura di un video già visto in parte.
 * Va dentro il contenitore della miniatura (posizionato), che la ancora in
 * basso — vedi `.watch-progress` in App.css. Spenta con la preferenza
 * "Riprendi da dove eri rimasto" (Impostazioni).
 */
export default function WatchProgressBar({ videoId }) {
  const { prefs } = usePrefs();
  const { progressi } = useWatchProgress();
  const pct = prefs.resume === false ? null : percentualeVista(progressi[videoId]);
  if (pct == null) return null;
  return (
    <div className="watch-progress" aria-label={`Visto al ${Math.round(pct)}%`}>
      <div className="watch-progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
