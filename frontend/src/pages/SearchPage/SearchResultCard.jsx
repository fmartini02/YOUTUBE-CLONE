import { formatDuration, formatViews, formatDate, proxyImg } from "../../api";
import ChannelLink, { daLinkCanale } from "../../components/ChannelLink";
import { PlaylistBadge } from "../../components/PlaylistCard";

export function SearchSkeleton({ query }) {
  return (
    <div>
      <p style={{ color: "var(--text2)", marginBottom: 16 }}>Cerco "{query}"...</p>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} style={{ display: "flex", gap: 16, marginBottom: 12 }}>
          <div className="skeleton" style={{ width: 240, height: 135, borderRadius: 10, flexShrink: 0 }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line short" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SearchMeta({ v, navigate }) {
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

export default function SearchResultCard({ v, navigate }) {
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
      </div>
      <SearchMeta v={v} navigate={navigate} />
    </div>
  );
}

/**
 * Risultato di tipo playlist: stessa riga di un video, ma porta alla pagina
 * della playlist e sulla copertina dice "Playlist" invece della durata.
 */
export function SearchPlaylistCard({ v, navigate }) {
  return (
    <div className="search-card" onClick={e => { if (!daLinkCanale(e)) navigate("playlist", { listId: v.id }); }}>
      <div className="search-thumb">
        {v.thumbnail && <img src={proxyImg(v.thumbnail)} alt={v.title} />}
        <PlaylistBadge count={v.count} />
      </div>
      <div className="search-meta">
        <div className="search-title">{v.title}</div>
        <div className="search-channel">
          <ChannelLink channelId={v.channel_id} name={v.channel} navigate={navigate} />
        </div>
        <div className="search-stats" style={{ marginTop: 8 }}>Visualizza la playlist completa</div>
      </div>
    </div>
  );
}
