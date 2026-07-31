import { useState, useEffect } from "react";
import { api } from "../api";

export default function SubscriptionsPage({ navigate }) {
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feed, setFeed] = useState([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [view, setView] = useState("feed"); // feed | channels

  useEffect(() => {
    api.subscriptions().then(d => {
      setSubs(d.subscriptions || []);
      setLoading(false);
    }).catch(() => setLoading(false));

    setFeedLoading(true);
    api.subsFeed().then(d => {
      setFeed(d.results || []);
      setFeedLoading(false);
    }).catch(() => setFeedLoading(false));
  }, []);

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
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Abbonamenti</h1>
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
          <div className="video-grid">
            {feed.map(v => (
              <div key={v.id} className="video-card" onClick={() => navigate("video", { videoId: v.id })}>
                <div className="thumbnail-wrap">
                  <img src={v.thumbnail} alt={v.title} loading="lazy" />
                  {v.duration && <span className="duration">{v.duration}</span>}
                </div>
                <div className="video-info">
                  <div className="avatar">{(v.channel||"?")[0]}</div>
                  <div className="video-meta">
                    <div className="video-title">{v.title}</div>
                    <div className="video-channel">{v.channel}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {view === "channels" && (
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
                <img src={ch.thumbnail} alt={ch.name} style={{ width: 64, height: 64, borderRadius: "50%", marginBottom: 8 }} />
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
    </div>
  );
}
