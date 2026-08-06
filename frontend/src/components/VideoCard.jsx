import { formatDuration, formatViews, formatDate } from "../api";
import ChannelLink, { daLinkCanale } from "./ChannelLink";

export default function VideoCard({ video, navigate, onPlay, onDownload, avatarUrl }) {
  const avatar = video.avatar || avatarUrl;

  return (
    <div
      className="video-card"
      onClick={e => {
        // Il tocco sul logo o sul nome del canale porta al canale, non al
        // video: qui si controlla la provenienza invece di fidarsi solo dello
        // stopPropagation del link (col dito quel click può non arrivare).
        if (daLinkCanale(e)) return;
        navigate("video", { videoId: video.id });
      }}
    >
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
        <ChannelLink channelId={video.channel_id} name={video.channel} navigate={navigate} className="avatar">
          {/* referrerPolicy no-referrer: con il Referer di localhost i server
              yt3.ggpht.com rispondono 429 con una pagina HTML, e Chromium la
              blocca (ERR_BLOCKED_BY_ORB) — senza questo il logo resta vuoto. */}
          {avatar
            ? <img src={avatar} alt={video.channel} loading="lazy" referrerPolicy="no-referrer" />
            : (video.channel || "?")[0]}
        </ChannelLink>
        <div className="video-meta">
          <div className="video-title">{video.title}</div>
          <div className="video-channel">
            <ChannelLink channelId={video.channel_id} name={video.channel} navigate={navigate} />
          </div>
          <div className="video-stats">
            {/* Il separatore solo se c'è davvero qualcosa da separare: YouTube
                non dà le visualizzazioni per i video appena usciti, e senza
                questo la riga cominciava con un "• " orfano. */}
            {[formatViews(video.views), video.published ? formatDate(video.published) : ""]
              .filter(Boolean).join(" • ")}
          </div>
        </div>
      </div>
    </div>
  );
}
