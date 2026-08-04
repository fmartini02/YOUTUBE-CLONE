import { formatDuration, formatViews, formatDate } from "../api";

export default function VideoCard({ video, navigate, onPlay, onDownload, avatarUrl }) {
  const avatar = video.avatar || avatarUrl;

  return (
    <div className="video-card" onClick={() => navigate("video", { videoId: video.id })}>
      <div className="thumbnail-wrap">
        <img src={video.thumbnail} alt={video.title} loading="lazy" />
        {video.duration && <span className="duration">{formatDuration(video.duration)}</span>}
        {/* Niente stopPropagation qui: cliccare ovunque sulla copertina deve
            far partire il video subito, come su YouTube. Solo il bottone
            download ferma la propagazione, altrimenti cliccarlo navigherebbe
            anche alla pagina video. */}
        <div className="download-overlay">
          <button className="dl-btn" onClick={e => { e.stopPropagation(); onDownload && onDownload(video); }}>
            ⬇ Download
          </button>
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
