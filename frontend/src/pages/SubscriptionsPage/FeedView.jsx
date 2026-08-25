import VideoCard from "../../components/VideoCard";

function FeedSkeleton() {
  return (
    <div className="video-grid" style={{ marginTop: 40 }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="skeleton-card">
          <div className="skeleton skeleton-thumb" />
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line short" />
        </div>
      ))}
    </div>
  );
}

export default function FeedView({ feedLoading, feed, avatars, navigate, sentinelRef, loadingMore }) {
  if (feedLoading) return <div style={{ color: "var(--text2)" }}>Caricamento feed...</div>;
  if (feed.length === 0) {
    return (
      <div style={{ color: "var(--text3)", textAlign: "center", padding: 40 }}>
        Nessun video nel feed. Carica i cookie YouTube per il feed personalizzato.
      </div>
    );
  }
  return (
    <>
      <div className="video-grid">
        {feed.map(v => <VideoCard key={v.id} video={v} navigate={navigate} avatarUrl={avatars[v.channel_id]} />)}
      </div>
      {/* Sentinella: quando entra nel viewport scatta il caricamento */}
      <div ref={sentinelRef} style={{ height: 1 }} />
      {loadingMore && <FeedSkeleton />}
    </>
  );
}
