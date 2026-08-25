import { formatDuration, formatViews } from "../../api";
import ChannelLink, { daLinkCanale } from "../../components/ChannelLink";

function RelatedItem({ v, navigate }) {
  return (
    <div
      className="related-item"
      onClick={e => { if (daLinkCanale(e)) return; navigate("video", { videoId: v.id }); }}
    >
      <div className="related-thumb">
        <img src={v.thumbnail} alt={v.title} loading="lazy" />
        {v.duration && <span className="related-duration">{formatDuration(v.duration)}</span>}
      </div>
      <div className="related-meta">
        <div className="related-title">{v.title}</div>
        <div className="related-channel">
          <ChannelLink channelId={v.channel_id} name={v.channel} navigate={navigate} />
        </div>
        <div className="related-views">{formatViews(v.views)}</div>
      </div>
    </div>
  );
}

export default function RelatedSidebar({ related, navigate, sentinelRef, loading }) {
  return (
    <div className="related-sidebar">
      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: "var(--text2)" }}>Video correlati</h3>
      {related.map(v => <RelatedItem key={v.id} v={v} navigate={navigate} />)}
      {/* Sentinella: entrando nel viewport carica il blocco successivo del mix */}
      <div ref={sentinelRef} style={{ height: 1 }} />
      {loading && (
        <div style={{ padding: "12px 0", textAlign: "center", fontSize: 13, color: "var(--text3)" }}>Caricamento…</div>
      )}
    </div>
  );
}
