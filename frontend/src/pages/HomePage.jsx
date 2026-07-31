import { useState, useEffect } from "react";
import { api } from "../api";
import VideoCard from "../components/VideoCard";
import { useToast } from "../hooks/useToast";

const CATEGORIES = ["Tutti", "Musica", "Gaming", "Notizie", "Sport", "Film", "Cucina", "Tecnologia"];

export default function HomePage({ navigate, authStatus }) {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("Tutti");
  const [feedSource, setFeedSource] = useState(null); // null | "personal" | "trending"
  const { addToast, ToastContainer } = useToast();

  const authenticated = authStatus?.authenticated;

  useEffect(() => {
    setLoading(true);

    // Se autenticato e nella tab "Tutti", prova il feed personale
    const fetchFn = (authenticated && category === "Tutti")
      ? api.subsFeed().then(d => { setFeedSource(d.results?.length ? "personal" : "trending"); return d; })
      : (category === "Tutti"
          ? api.trending().then(d => { setFeedSource("trending"); return d; })
          : api.search(category).then(d => { setFeedSource(null); return d; }));

    fetchFn
      .then(data => setVideos(data.results || []))
      .catch(() => {
        // Fallback to trending
        api.trending().then(d => { setVideos(d.results || []); setFeedSource("trending"); }).catch(() => {});
      })
      .finally(() => setLoading(false));
  }, [category, authenticated]);

  function handleDownload(video) {
    const url = api.downloadUrl(video.id);
    const a = document.createElement("a");
    a.href = url; a.download = `${video.title}.mp4`; a.click();
    addToast(`⬇ Download avviato: ${video.title.slice(0, 40)}...`);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div className="filter-chips" style={{ marginBottom: 0 }}>
          {CATEGORIES.map(c => (
            <button key={c} className={`chip${category === c ? " active" : ""}`} onClick={() => setCategory(c)}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Feed source indicator */}
      {feedSource && (
        <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 12, marginTop: 8 }}>
          {feedSource === "personal"
            ? "🎯 Feed personalizzato dai tuoi abbonamenti"
            : "🔥 Video in tendenza"}
        </div>
      )}

      {loading ? (
        <div className="video-grid">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="skeleton-card">
              <div className="skeleton skeleton-thumb" />
              <div className="skeleton skeleton-line" />
              <div className="skeleton skeleton-line short" />
            </div>
          ))}
        </div>
      ) : videos.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text2)" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>😶</div>
          <div>Nessun video trovato.</div>
          {authenticated && category === "Tutti" && (
            <div style={{ fontSize: 13, marginTop: 8, color: "var(--text3)" }}>
              Carica i cookie YouTube nelle impostazioni per il feed dei tuoi abbonamenti.
            </div>
          )}
        </div>
      ) : (
        <div className="video-grid">
          {videos.map(v => (
            <VideoCard key={v.id} video={v} navigate={navigate} onDownload={handleDownload} />
          ))}
        </div>
      )}
      <ToastContainer />
    </div>
  );
}
