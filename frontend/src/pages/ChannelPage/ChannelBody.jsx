import VideoCard from "../../components/VideoCard";
import { EMPTY_MESSAGES } from "./channelMessages";

function SkeletonGrid({ count, style }) {
  return (
    <div className="video-grid" style={style}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-card">
          <div className="skeleton skeleton-thumb" />
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line short" />
        </div>
      ))}
    </div>
  );
}

function ChannelEmpty({ emptyReason, navigate }) {
  const msg = EMPTY_MESSAGES[emptyReason] || EMPTY_MESSAGES["nessun-video"];
  return (
    <div style={{ textAlign: "center", padding: 60, color: "var(--text2)" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
      <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>{msg.title}</div>
      <div style={{ maxWidth: 460, margin: "0 auto 18px", lineHeight: 1.5 }}>{msg.body}</div>
      <button className="chip" onClick={() => navigate("subscriptions")}>Torna alle iscrizioni</button>
    </div>
  );
}

export default function ChannelBody({ loading, videos, emptyReason, navigate, avatar, sentinelRef, loadingMore }) {
  if (loading) return <SkeletonGrid count={12} />;
  if (videos.length === 0) return <ChannelEmpty emptyReason={emptyReason} navigate={navigate} />;
  return (
    <>
      <div className="video-grid">
        {videos.map(v => <VideoCard key={v.id} video={v} navigate={navigate} avatarUrl={avatar} />)}
      </div>
      {/* Sentinella: quando entra nel viewport scatta il caricamento */}
      <div ref={sentinelRef} style={{ height: 1 }} />
      {loadingMore && <SkeletonGrid count={4} style={{ marginTop: 40 }} />}
    </>
  );
}
