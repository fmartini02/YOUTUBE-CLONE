import VideoCard from "../../components/VideoCard";

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

export default function HomeGrid({ videos, navigate, avatars, sentinelRef, loadingMore }) {
  return (
    <>
      <div className="video-grid">
        {videos.map(v => <VideoCard key={v.id} video={v} navigate={navigate} avatarUrl={avatars[v.channel_id]} />)}
      </div>
      {/* Sentinella: quando entra nel viewport scatta il caricamento */}
      <div ref={sentinelRef} style={{ height: 1 }} />
      {loadingMore && <SkeletonGrid count={4} style={{ marginTop: 40 }} />}
    </>
  );
}

export { SkeletonGrid };
