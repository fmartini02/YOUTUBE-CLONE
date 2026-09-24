import { formatDuration, formatViews, formatDate, proxyImg } from "../../api";
import ChannelLink, { daLinkCanale } from "../../components/ChannelLink";
import WatchProgressBar from "../../components/WatchProgressBar";

function VideoMeta({ v, navigate }) {
  return (
    <div className="search-meta">
      <div className="search-title">{v.title}</div>
      <div className="search-stats">
        {[formatViews(v.views), v.published ? formatDate(v.published) : ""].filter(Boolean).join(" • ")}
      </div>
      <div className="search-channel">
        <ChannelLink channelId={v.channel_id} name={v.channel} navigate={navigate} />
      </div>
      <div className="search-actions" onClick={e => e.stopPropagation()}>
        <button className="action-btn primary" onClick={() => navigate("video", { videoId: v.id })}>▶ Guarda</button>
      </div>
    </div>
  );
}

/** Risultato di tipo video: miniatura con la durata, titolo, visualizzazioni, canale. */
export default function VideoResult({ v, navigate }) {
  return (
    <div
      className="search-card"
      onClick={e => {
        if (daLinkCanale(e)) return;   // tocco sul canale: si va al canale
        navigate("video", { videoId: v.id });
      }}
    >
      <div className="search-thumb">
        <img src={proxyImg(v.thumbnail)} alt={v.title} />
        {v.duration && <span className="search-duration">{formatDuration(v.duration)}</span>}
        <WatchProgressBar videoId={v.id} />
      </div>
      <VideoMeta v={v} navigate={navigate} />
    </div>
  );
}
