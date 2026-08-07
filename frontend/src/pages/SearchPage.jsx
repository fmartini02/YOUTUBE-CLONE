import { useState, useEffect } from "react";
import { api, formatDuration, formatViews, formatDate } from "../api";
import { useToast } from "../hooks/useToast";
import ChannelLink, { daLinkCanale } from "../components/ChannelLink";

export default function SearchPage({ query, navigate }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const { addToast, ToastContainer } = useToast();

  useEffect(() => {
    if (!query) return;
    setLoading(true);
    setPage(1);
    api.search(query, 1)
      .then(d => setResults(d.results || []))
      .catch(() => addToast("Errore nella ricerca"))
      .finally(() => setLoading(false));
  }, [query]);

  if (loading) return (
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

  return (
    <div>
      <p style={{ color: "var(--text2)", marginBottom: 16, fontSize: 14 }}>
        Risultati per "<strong style={{ color: "var(--text)" }}>{query}</strong>" — {results.length} video
      </p>
      <div className="search-results">
        {results.map(v => (
          <div
            key={v.id}
            className="search-card"
            onClick={e => {
              if (daLinkCanale(e)) return;   // tocco sul canale: si va al canale
              navigate("video", { videoId: v.id });
            }}
          >
            <div className="search-thumb">
              <img src={v.thumbnail} alt={v.title} loading="lazy" />
              {v.duration && <span className="search-duration">{formatDuration(v.duration)}</span>}
            </div>
            <div className="search-meta">
              <div className="search-title">{v.title}</div>
              <div className="search-stats">
                {[formatViews(v.views), v.published ? formatDate(v.published) : ""]
                  .filter(Boolean).join(" • ")}
              </div>
              <div className="search-channel">
                <ChannelLink channelId={v.channel_id} name={v.channel} navigate={navigate} />
              </div>
              <div className="search-actions" onClick={e => e.stopPropagation()}>
                <button className="action-btn primary" onClick={() => navigate("video", { videoId: v.id })}>
                  ▶ Guarda
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <ToastContainer />
    </div>
  );
}
