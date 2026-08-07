import { useState, useEffect, useCallback } from "react";
import { api, errorMessage } from "../api";
import VideoCard from "../components/VideoCard";
import { useChannelAvatars } from "../hooks/useChannelAvatars";
import { useInfiniteScroll } from "../hooks/useInfiniteScroll";
import { useToast } from "../hooks/useToast";

const PAGE_SIZE = 30;

export default function SubscriptionsPage({ navigate }) {
  const [subs, setSubs] = useState([]);
  const [canManage, setCanManage] = useState(false);
  const [leaving, setLeaving] = useState(null);  // id del canale che si sta lasciando
  const { addToast, ToastContainer } = useToast();
  const [loading, setLoading] = useState(true);
  const [feed, setFeed] = useState([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [view, setView] = useState("feed"); // feed | channels
  const avatars = useChannelAvatars(feed);

  useEffect(() => {
    api.subscriptions().then(d => {
      setSubs(d.subscriptions || []);
      setCanManage(!!d.can_manage);
      setLoading(false);
    }).catch(() => setLoading(false));

    setFeedLoading(true);
    api.subsFeed(PAGE_SIZE, 0).then(d => {
      setFeed(d.results || []);
      setHasMore(!!d.has_more);
      setFeedLoading(false);
    }).catch(() => setFeedLoading(false));
  }, []);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    api.subsFeed(PAGE_SIZE, feed.length).then(d => {
      setFeed(f => {
        // Dedup per id: senza, chiavi React duplicate romperebbero la griglia.
        const seen = new Set(f.map(v => v.id));
        return [...f, ...(d.results || []).filter(v => !seen.has(v.id))];
      });
      setHasMore(!!d.has_more);
      setLoadingMore(false);
    }).catch(() => setLoadingMore(false));
  }, [feed.length, hasMore, loadingMore]);

  /**
   * Disiscrizione dalla lista canali: la conferma è d'obbligo perché il tasto
   * sta dentro la card che apre il canale, e un tocco storto costerebbe
   * un'iscrizione. Il canale sparisce subito dalla lista — il server ha già
   * aggiornato la sua, quindi non serve richiederla.
   */
  async function unsubscribe(ch) {
    if (leaving) return;
    if (!window.confirm(`Annullare l'iscrizione a ${ch.name || "questo canale"}?`)) return;
    setLeaving(ch.id);
    try {
      await api.unsubscribe(ch.id);
      setSubs(list => list.filter(s => s.id !== ch.id));
      setFeed(f => f.filter(v => v.channel_id !== ch.id));
      addToast(`Iscrizione annullata: ${ch.name || ch.id}`);
    } catch (e) {
      addToast(errorMessage(e, "Disiscrizione non riuscita"));
    } finally {
      setLeaving(null);
    }
  }

  const sentinelRef = useInfiniteScroll({
    // Solo nella vista feed: la lista canali non è paginata.
    hasMore: hasMore && view === "feed",
    loading: feedLoading || loadingMore,
    onLoadMore: loadMore,
  });

  if (loading) return <div style={{ color: "var(--text2)" }}>Caricamento iscrizioni...</div>;

  if (subs.length === 0) return (
    <div style={{ textAlign: "center", padding: 60, color: "var(--text2)" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>📺</div>
      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Nessuna iscrizione</div>
      <div style={{ fontSize: 14, marginBottom: 20 }}>Collega il tuo account Google per vedere i tuoi canali</div>
      <button className="action-btn primary" onClick={() => navigate("settings")}>
        ⚙️ Vai alle impostazioni
      </button>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Iscrizioni</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={`chip${view === "feed" ? " active" : ""}`} onClick={() => setView("feed")}>Feed</button>
          <button className={`chip${view === "channels" ? " active" : ""}`} onClick={() => setView("channels")}>Canali ({subs.length})</button>
        </div>
      </div>

      {view === "feed" && (
        feedLoading ? (
          <div style={{ color: "var(--text2)" }}>Caricamento feed...</div>
        ) : feed.length === 0 ? (
          <div style={{ color: "var(--text3)", textAlign: "center", padding: 40 }}>
            Nessun video nel feed. Carica i cookie YouTube per il feed personalizzato.
          </div>
        ) : (
          <>
            <div className="video-grid">
              {feed.map(v => (
                <VideoCard key={v.id} video={v} navigate={navigate} avatarUrl={avatars[v.channel_id]} />
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
        )
      )}

      {view === "channels" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
          {subs.map(ch => (
            <div
              key={ch.id}
              style={{ background: "var(--bg2)", borderRadius: 12, padding: 16, cursor: "pointer", textAlign: "center", transition: "background 0.2s", position: "relative" }}
              onClick={() => navigate("channel", { channelId: ch.id, channelName: ch.name })}
              onMouseEnter={e => e.currentTarget.style.background = "var(--bg3)"}
              onMouseLeave={e => e.currentTarget.style.background = "var(--bg2)"}
            >
              {canManage && (
                <button
                  onClick={e => { e.stopPropagation(); unsubscribe(ch); }}
                  disabled={leaving === ch.id}
                  title="Annulla iscrizione"
                  style={{
                    position: "absolute", top: 6, right: 6, width: 26, height: 26,
                    borderRadius: "50%", border: "none", cursor: "pointer",
                    background: "var(--bg3)", color: "var(--text2)", fontSize: 14, lineHeight: 1,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {leaving === ch.id ? "…" : "✕"}
                </button>
              )}
              {ch.thumbnail ? (
                <img src={ch.thumbnail} alt={ch.name} referrerPolicy="no-referrer" style={{ width: 64, height: 64, borderRadius: "50%", marginBottom: 8, objectFit: "cover" }} />
              ) : (
                <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--bg3)", margin: "0 auto 8px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>
                  {(ch.name||"?")[0]}
                </div>
              )}
              <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ch.name}</div>
            </div>
          ))}
        </div>
      )}
      <ToastContainer />
    </div>
  );
}
