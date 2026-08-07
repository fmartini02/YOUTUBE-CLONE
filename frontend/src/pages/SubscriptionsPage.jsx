import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import VideoCard from "../components/VideoCard";
import SubscribeButton from "../components/SubscribeButton";
import { useChannelAvatars } from "../hooks/useChannelAvatars";
import { useInfiniteScroll } from "../hooks/useInfiniteScroll";
import { useToast } from "../hooks/useToast";

const PAGE_SIZE = 30;

export default function SubscriptionsPage({ navigate, onSubsChange, authStatus }) {
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feed, setFeed] = useState([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [view, setView] = useState("feed"); // feed | channels
  const avatars = useChannelAvatars(feed, authStatus?.authenticated);
  const { addToast, ToastContainer } = useToast();

  useEffect(() => {
    api.subscriptions().then(d => {
      setSubs(d.subscriptions || []);
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

  // Disiscrivendosi dall'ultimo canale la scheda "Canali" sparisce: senza
  // questo la pagina resterebbe su una vista che non si può più scegliere e
  // quindi vuota.
  const vista = subs.length ? view : "feed";

  const sentinelRef = useInfiniteScroll({
    // Solo nella vista feed: la lista canali non è paginata.
    hasMore: hasMore && vista === "feed",
    loading: feedLoading || loadingMore,
    onLoadMore: loadMore,
  });

  if (loading || feedLoading) return <div style={{ color: "var(--text2)" }}>Caricamento iscrizioni...</div>;

  // L'elenco dei canali arriva dall'OAuth, il feed dai cookie: sono due
  // autenticazioni indipendenti e ognuna funziona da sola. La pagina va
  // dichiarata vuota solo se mancano ENTRAMBE — con i soli cookie il server
  // serve il feed iscrizioni vero, e mostrare "Nessuna iscrizione: collega il
  // tuo account Google" lo nascondeva del tutto.
  if (subs.length === 0 && feed.length === 0) return (
    <div style={{ textAlign: "center", padding: 60, color: "var(--text2)" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>📺</div>
      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Nessuna iscrizione</div>
      <div style={{ fontSize: 14, marginBottom: 20 }}>
        Carica i cookie di YouTube per il feed delle iscrizioni, oppure collega
        l'account Google per l'elenco dei canali.
      </div>
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
          {/* La scheda canali esiste solo con l'account collegato: senza OAuth
              l'elenco non c'è, e un "Canali (0)" cliccabile porterebbe a una
              griglia vuota senza spiegazione. */}
          {subs.length > 0 && (
            <button className={`chip${view === "channels" ? " active" : ""}`} onClick={() => setView("channels")}>Canali ({subs.length})</button>
          )}
        </div>
      </div>

      {vista === "feed" && (
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

      {vista === "channels" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
          {subs.map(ch => (
            <div
              key={ch.id}
              style={{ background: "var(--bg2)", borderRadius: 12, padding: 16, cursor: "pointer", textAlign: "center", transition: "background 0.2s" }}
              onClick={() => navigate("channel", { channelId: ch.id, channelName: ch.name })}
              onMouseEnter={e => e.currentTarget.style.background = "var(--bg3)"}
              onMouseLeave={e => e.currentTarget.style.background = "var(--bg2)"}
            >
              {ch.thumbnail ? (
                <img src={ch.thumbnail} alt={ch.name} referrerPolicy="no-referrer" style={{ width: 64, height: 64, borderRadius: "50%", marginBottom: 8, objectFit: "cover" }} />
              ) : (
                <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--bg3)", margin: "0 auto 8px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>
                  {(ch.name||"?")[0]}
                </div>
              )}
              <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ch.name}</div>
              <div style={{ marginTop: 10 }}>
                {/* Annullata l'iscrizione, la scheda sparisce subito: lasciarla
                    lì con scritto "Iscriviti" farebbe sembrare che non sia
                    successo niente. Insieme alla scheda se ne vanno anche i
                    video di quel canale già caricati nella scheda "Feed": il
                    server ha ripulito la sua cache, ma la lista che abbiamo
                    già in pagina no. */}
                <SubscribeButton
                  channelId={ch.id}
                  channelName={ch.name}
                  thumbnail={ch.thumbnail}
                  onNotice={addToast}
                  onChange={(iscritto, id) => {
                    if (!iscritto) {
                      setSubs(list => list.filter(c => c.id !== id));
                      setFeed(f => f.filter(v => v.channel_id !== id));
                    }
                    onSubsChange?.();
                  }}
                  small
                />
              </div>
            </div>
          ))}
        </div>
      )}
      <ToastContainer />
    </div>
  );
}
