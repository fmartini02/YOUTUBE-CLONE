import { formatTime } from "../../../components/VideoPlayer/videoPlayerHelpers";

/**
 * Capitoli del video, uno per riga: `[mm:ss] Titolo`.
 *
 * Niente miniatura per capitolo, a differenza di YouTube: per averle il server
 * dovrebbe decodificare un fotogramma per ognuna — secondi di ffmpeg e
 * megabyte di immagini, per una lista che si legge benissimo a testo.
 *
 * Toccare un capitolo NON chiude il pannello: come nell'app di YouTube si resta
 * dove si è, per poter passare al capitolo dopo senza riaprire tutto. Il video
 * si sposta sotto, dove resta visibile (il pannello si ferma a 75vh).
 */
export default function ChaptersTab({ chapters, onSalta }) {
  return (
    <div className="desc-tab-body">
      {(chapters || []).map((c, i) => (
        <button className="chapter-row" key={`${c.start}-${i}`} onClick={() => onSalta?.(c.start)}>
          <span className="chapter-time">{formatTime(c.start)}</span>
          <span className="chapter-title">{c.title}</span>
        </button>
      ))}
    </div>
  );
}
