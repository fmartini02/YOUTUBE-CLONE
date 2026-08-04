import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../api";
import VideoCard from "../components/VideoCard";
import { useToast } from "../hooks/useToast";
import { useChannelAvatars } from "../hooks/useChannelAvatars";
import { useInfiniteScroll } from "../hooks/useInfiniteScroll";

const CATEGORIES = ["Tutti", "Musica", "Gaming", "Notizie", "Sport", "Film", "Cucina", "Tecnologia"];
const PAGE_SIZE = 24;

export default function HomePage({ navigate, authStatus }) {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [category, setCategory] = useState("Tutti");
  const [feedSource, setFeedSource] = useState(null); // null | "youtube-home" | "trending"
  const { addToast, ToastContainer } = useToast();
  const avatars = useChannelAvatars(videos);

  // Da quale elenco stiamo paginando: la home può ricadere sui trending, e
  // il caricamento successivo deve proseguire sullo STESSO elenco invece di
  // ricominciare da capo o mescolare due fonti diverse.
  const pagerRef = useRef({ kind: "home", page: 1 });

  const fetchPage = useCallback((kind, page) => {
    if (kind === "search") return api.search(category, page);
    const offset = (page - 1) * PAGE_SIZE;
    return kind === "home" ? api.homeFeed(PAGE_SIZE, offset) : api.trending(PAGE_SIZE, offset);
  }, [category]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setVideos([]);
    setHasMore(false);

    (async () => {
      try {
        // "Tutti" = home vera e propria: prova la homepage reale di YouTube
        // (richiede i cookie, vedi Impostazioni), altrimenti i trending. Non è
        // più legata alle iscrizioni — quello è il compito della pagina Iscrizioni.
        let kind = category === "Tutti" ? "home" : "search";
        let data = await fetchPage(kind, 1);
        if (kind === "home" && !data.results?.length) {
          kind = "trending";
          data = await fetchPage(kind, 1);
        }
        if (cancelled) return;
        pagerRef.current = { kind, page: 1 };
        setFeedSource(kind === "search" ? null : kind === "home" ? "youtube-home" : "trending");
        setVideos(data.results || []);
        setHasMore(!!data.has_more);
      } catch {
        if (cancelled) return;
        try {
          const d = await fetchPage("trending", 1);
          if (cancelled) return;
          pagerRef.current = { kind: "trending", page: 1 };
          setFeedSource("trending");
          setVideos(d.results || []);
          setHasMore(!!d.has_more);
        } catch { /* niente da mostrare: resta lo stato vuoto */ }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [category, fetchPage]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const { kind, page } = pagerRef.current;
      const next = page + 1;
      const data = await fetchPage(kind, next);
      pagerRef.current = { kind, page: next };
      setVideos(prev => {
        // Dedup per id: gli elenchi di YouTube possono ripetere lo stesso
        // video tra una pagina e l'altra, e chiavi React duplicate romperebbero
        // il rendering della griglia.
        const seen = new Set(prev.map(v => v.id));
        return [...prev, ...(data.results || []).filter(v => !seen.has(v.id))];
      });
      setHasMore(!!data.has_more);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, hasMore, loadingMore]);

  const sentinelRef = useInfiniteScroll({
    hasMore,
    loading: loading || loadingMore,
    onLoadMore: loadMore,
  });

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
          {feedSource === "youtube-home"
            ? "🎯 La tua home YouTube"
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
        </div>
      ) : (
        <>
          <div className="video-grid">
            {videos.map(v => (
              <VideoCard key={v.id} video={v} navigate={navigate} onDownload={handleDownload} avatarUrl={avatars[v.channel_id]} />
            ))}
          </div>

          {/* Sentinella: quando entra nel viewport scatta il caricamento */}
          <div ref={sentinelRef} style={{ height: 1 }} />

          {loadingMore && (
            <div className="video-grid" style={{ marginTop: 40 }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton-card">
                  <div className="skeleton skeleton-thumb" />
                  <div className="skeleton skeleton-line" />
                  <div className="skeleton skeleton-line short" />
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <ToastContainer />
    </div>
  );
}
