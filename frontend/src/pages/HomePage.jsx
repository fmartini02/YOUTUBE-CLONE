import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../api";
import VideoCard from "../components/VideoCard";
import { useToast } from "../hooks/useToast";
import { useChannelAvatars } from "../hooks/useChannelAvatars";
import { useInfiniteScroll } from "../hooks/useInfiniteScroll";

const CATEGORIES = ["Tutti", "Musica", "Gaming", "Notizie", "Sport", "Film", "Cucina", "Tecnologia"];
const PAGE_SIZE = 24;

// La home mostra SOLO le raccomandazioni personali. Quando mancano, il motivo
// è sempre la sessione YouTube: meglio dire quale dei tre casi è, perché la
// cosa da fare cambia.
const EMPTY_MESSAGES = {
  "no-cookies": {
    title: "Nessun cookie YouTube caricato",
    body: "Le raccomandazioni personali esistono solo per un account loggato. Importa i cookie dal browser in Impostazioni.",
  },
  "not-logged-in": {
    title: "I cookie non contengono una sessione YouTube",
    body: "Essere loggati su Google non basta: apri youtube.com nel browser, controlla di essere loggato, poi reimporta i cookie da Impostazioni.",
  },
  "feed-vuoto": {
    title: "YouTube non ha restituito raccomandazioni",
    body: "Di solito significa che la sessione è scaduta. Reimporta i cookie da Impostazioni e ricarica.",
  },
  errore: {
    title: "Errore nel caricamento della home",
    body: "Il server non ha risposto. Controlla che sia attivo e riprova.",
  },
};

export default function HomePage({ navigate, authStatus }) {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [category, setCategory] = useState("Tutti");
  const [feedSource, setFeedSource] = useState(null); // null | "youtube-home"
  const [emptyReason, setEmptyReason] = useState(null); // perché la home è vuota
  const { addToast, ToastContainer } = useToast();
  const avatars = useChannelAvatars(videos);

  // Da quale elenco stiamo paginando, per proseguire sullo STESSO elenco
  // invece di ricominciare da capo.
  const pagerRef = useRef({ kind: "home", page: 1 });

  const fetchPage = useCallback((kind, page) => {
    if (kind === "search") return api.search(category, page);
    return api.homeFeed(PAGE_SIZE, (page - 1) * PAGE_SIZE);
  }, [category]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setVideos([]);
    setHasMore(false);
    setEmptyReason(null);

    (async () => {
      // "Tutti" = home vera e propria: solo le raccomandazioni reali di
      // YouTube (servono i cookie di una sessione loggata, vedi Impostazioni).
      // Niente ripiego sui trending: mostrare le tendenze italiane al posto
      // della propria home è peggio di una home vuota, perché sembra che
      // funzioni tutto mentre invece la sessione è da rifare.
      const kind = category === "Tutti" ? "home" : "search";
      try {
        const data = await fetchPage(kind, 1);
        if (cancelled) return;
        pagerRef.current = { kind, page: 1 };
        setFeedSource(kind === "home" ? "youtube-home" : null);
        setVideos(data.results || []);
        setHasMore(!!data.has_more);
        if (kind === "home" && !data.results?.length) setEmptyReason(data.reason || "feed-vuoto");
      } catch {
        if (cancelled) return;
        setFeedSource(kind === "home" ? "youtube-home" : null);
        setEmptyReason(kind === "home" ? "errore" : null);
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
      {feedSource === "youtube-home" && videos.length > 0 && (
        <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 12, marginTop: 8 }}>
          🎯 La tua home YouTube
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
          <div style={{ fontSize: 40, marginBottom: 12 }}>{emptyReason ? "🔒" : "😶"}</div>
          {emptyReason ? (
            <>
              <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
                {EMPTY_MESSAGES[emptyReason]?.title || EMPTY_MESSAGES["feed-vuoto"].title}
              </div>
              <div style={{ maxWidth: 460, margin: "0 auto 18px", lineHeight: 1.5 }}>
                {EMPTY_MESSAGES[emptyReason]?.body || EMPTY_MESSAGES["feed-vuoto"].body}
              </div>
              <button className="chip" onClick={() => navigate("settings")}>
                Apri Impostazioni
              </button>
            </>
          ) : (
            <div>Nessun video trovato.</div>
          )}
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
