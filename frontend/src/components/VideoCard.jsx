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
          {avatar ? <img src={avatar} alt={video.channel} loading="lazy" /> : (video.channel || "?")[0]}
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
