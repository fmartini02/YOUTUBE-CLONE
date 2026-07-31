import { formatDuration, formatViews, formatDate } from "../api";

export default function VideoCard({ video, navigate, onPlay, onDownload }) {
  return (
    <div className="video-card" onClick={() => navigate("video", { videoId: video.id })}>
      <div className="thumbnail-wrap">
        <img src={video.thumbnail} alt={video.title} loading="lazy" />
        {video.duration && <span className="duration">{formatDuration(video.duration)}</span>}
        <div className="download-overlay" onClick={e => e.stopPropagation()}>
          <button className="play-btn" onClick={() => navigate("video", { videoId: video.id })}>
            ▶ Guarda
          </button>
          <button className="dl-btn" onClick={() => onDownload && onDownload(video)}>
            ⬇ Download
          </button>
        </div>
      </div>
      <div className="video-info">
        <div className="avatar">{(video.channel || "?")[0]}</div>
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
