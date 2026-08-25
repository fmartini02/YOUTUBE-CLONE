import CommentItem from "./CommentItem";

function CommentsSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} style={{ display: "flex", gap: 12 }}>
          <div className="skeleton" style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0 }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="skeleton skeleton-line short" />
            <div className="skeleton skeleton-line" />
          </div>
        </div>
      ))}
    </div>
  );
}

function CommentsList({ comments, videoId, me, canComment, supportsReplies, navigate, onToast }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {comments.map(c => (
        <CommentItem
          key={c.id} c={c} videoId={videoId} me={me} canComment={canComment}
          supportsReplies={supportsReplies} navigate={navigate} onToast={onToast}
        />
      ))}
    </div>
  );
}

function LoadMoreButton({ nextToken, loadingMore, onLoadMore }) {
  if (!nextToken) return null;
  return (
    <button className="action-btn" onClick={onLoadMore} disabled={loadingMore} style={{ marginTop: 20 }}>
      {loadingMore ? "Caricamento..." : "Carica altri commenti"}
    </button>
  );
}

export default function CommentsBody({
  loading, comments, error, videoId, me, canComment, supportsReplies,
  navigate, onToast, nextToken, loadingMore, onLoadMore,
}) {
  if (loading) return <CommentsSkeleton />;
  if (comments.length === 0) {
    return <p style={{ fontSize: 13, color: "var(--text3)" }}>{error || "Nessun commento disponibile per questo video."}</p>;
  }
  return (
    <>
      <CommentsList comments={comments} videoId={videoId} me={me} canComment={canComment} supportsReplies={supportsReplies} navigate={navigate} onToast={onToast} />
      <LoadMoreButton nextToken={nextToken} loadingMore={loadingMore} onLoadMore={onLoadMore} />
    </>
  );
}
