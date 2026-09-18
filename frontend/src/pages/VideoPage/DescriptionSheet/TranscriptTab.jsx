import { formatTime } from "../../../components/VideoPlayer/videoPlayerHelpers";
import { useTranscript } from "./useTranscript";

/**
 * Perché la lista non c'è: stati espliciti e non una lista vuota muta. Il
 * caricamento in particolare va detto — /api/subtitles rifà un'estrazione
 * yt-dlp completa, quindi ci mette qualche secondo e senza una scritta sembra
 * che il tocco non abbia fatto niente.
 */
function StatoTrascrizione({ caricamento, errore, vuota }) {
  if (caricamento) return <div className="transcript-stato">Caricamento trascrizione…</div>;
  if (errore) {
    return (
      <div className="transcript-stato">
        Non è stato possibile scaricare la trascrizione. Riprova fra qualche secondo.
      </div>
    );
  }
  if (vuota) return <div className="transcript-stato">Per questo video non ci sono sottotitoli da leggere.</div>;
  return null;
}

/** Trascrizione: ogni riga porta il video al momento in cui viene detta. */
export default function TranscriptTab({ videoId, sottotitoli, onSalta }) {
  const { subtitleLangs, subtitleLang } = sottotitoli || {};
  const { righe, caricamento, errore } = useTranscript(videoId, subtitleLangs, subtitleLang);

  return (
    <div className="desc-tab-body">
      <StatoTrascrizione caricamento={caricamento} errore={errore} vuota={!righe.length} />
      {righe.map((r, i) => (
        <button className="transcript-row" key={`${r.start}-${i}`} onClick={() => onSalta?.(r.start)}>
          <span className="transcript-time">{formatTime(r.start)}</span>
          <span className="transcript-text">{r.text}</span>
        </button>
      ))}
    </div>
  );
}
