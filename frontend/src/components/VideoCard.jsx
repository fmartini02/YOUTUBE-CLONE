import { useState } from "react";
import { api, formatDuration, formatViews, formatDate } from "../api";
import { useCastContext } from "../App";

export default function VideoCard({ video, navigate, onPlay, onDownload, avatarUrl }) {
  const avatar = video.avatar || avatarUrl;
  const cast = useCastContext();
  const [queuing, setQueuing] = useState(false);

  async function handleAddToQueue(e) {
    e.stopPropagation();
    if (queuing) return;
    setQueuing(true);
    try {
      // api.castUrl() costruisce l'indirizzo in modo sincrono (nessuna
      // estrazione preventiva necessaria): i metadati li abbiamo già dalla
      // card stessa, il rimux avviene lato server solo quando il Cast lo richiede.
      const ok = await cast.addToQueue({
        streamUrl: api.castUrl(video.id),
        title: video.title,
        channel: video.channel,
        thumbnail: video.thumbnail,
        duration: video.duration,
        videoId: video.id,
      });
      if (!ok) console.warn("Cast: impossibile aggiungere alla coda", video.id);
    } finally {
      setQueuing(false);
    }
  }

  return (
    <div className="video-card" onClick={() => navigate("video", { videoId: video.id })}>
      <div className="thumbnail-wrap">
        <img src={video.thumbnail} alt={video.title} loading="lazy" />
        {video.duration && <span className="duration">{formatDuration(video.duration)}</span>}
        {/* Niente stopPropagation qui: cliccare ovunque sulla copertina deve
            far partire il video subito, come su YouTube. Solo i bottoni
            azione (download/coda) fermano la propagazione singolarmente,
            altrimenti cliccarli navigherebbe anche alla pagina video. */}
        <div className="download-overlay">
          <button className="dl-btn" onClick={e => { e.stopPropagation(); onDownload && onDownload(video); }}>
            ⬇ Download
          </button>
          {cast?.available && (
            <button className="dl-btn" onClick={handleAddToQueue} disabled={queuing} title="Aggiungi alla coda Chromecast">
              {queuing ? "⏳" : "➕ Coda"}
            </button>
          )}
        </div>
      </div>
      <div className="video-info">
        <div className="avatar">
          {/* referrerPolicy no-referrer: con il Referer di localhost i server
              yt3.ggpht.com rispondono 429 con una pagina HTML, e Chromium la
              blocca (ERR_BLOCKED_BY_ORB) — senza questo il logo resta vuoto. */}
          {avatar
            ? <img src={avatar} alt={video.channel} loading="lazy" referrerPolicy="no-referrer" />
            : (video.channel || "?")[0]}
        </div>
        <div className="video-meta">
          <div className="video-title">{video.title}</div>
          <div className="video-channel">{video.channel}</div>
          <div className="video-stats">
            {formatViews(video.views)}{video.published ? ` • ${formatDate(video.published)}` : ""}
          </div>
        </div>
      </div>
    </div>
  );
}
