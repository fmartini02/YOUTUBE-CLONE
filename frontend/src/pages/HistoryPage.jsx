import { useState, useEffect, useCallback } from "react";
import { api, formatDuration, timeAgo, proxyImg } from "../api";
import ChannelLink, { daLinkCanale } from "../components/ChannelLink";
import { useToast } from "../hooks/useToast";
import { raggruppaPerGiorno } from "./historyGrouping";
import { rimuoviVoce, svuotaCronologia } from "./historyActions";

/**
 * Cronologia dei video guardati.
 *
 * Il server la registrava già ad ogni apertura di un video (/api/history), ma
 * non c'era modo di vederla. Impaginata come una lista e non come una
 * griglia: qui conta *quando* si è visto un video, quindi le voci vanno
 * lette una sotto l'altra, raggruppate per giorno come su YouTube.
 */

function HistoryRow({ v, navigate, onRemove }) {
  return (
    <div className="history-row" onClick={e => !daLinkCanale(e) && navigate("video", { videoId: v.id })}>
      <div className="history-thumb">
        <img src={proxyImg(v.thumbnail || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`)} alt={v.title} />
        {v.duration ? <span className="duration">{formatDuration(v.duration)}</span> : null}
      </div>
      <div className="history-meta">
        <div className="history-title">{v.title}</div>
        <div className="history-sub">
          {v.channel_id
            ? <ChannelLink channelId={v.channel_id} name={v.channel} navigate={navigate} />
            : <span>{v.channel}</span>}
        </div>
        {/* timeAgo vuole un timestamp unix in secondi, come quello che salva il server. */}
        {v.watched_at ? <div className="history-sub">Guardato {timeAgo(v.watched_at)}</div> : null}
      </div>
      <button className="history-remove" title="Togli dalla cronologia" aria-label="Togli dalla cronologia"
        onClick={e => { e.stopPropagation(); onRemove(v.id); }}>
        ✕
      </button>
    </div>
  );
}

function HistoryGroup({ gruppo, navigate, onRemove }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--text2)", marginBottom: 12 }}>{gruppo.label}</h2>
      <div className="history-list">
        {gruppo.voci.map(v => <HistoryRow key={v.id} v={v} navigate={navigate} onRemove={onRemove} />)}
      </div>
    </section>
  );
}

function EmptyHistory() {
  return (
    <div style={{ textAlign: "center", padding: 60, color: "var(--text2)" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🕐</div>
      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Nessun video nella cronologia</div>
      <div style={{ fontSize: 14 }}>I video che guardi finiscono qui.</div>
    </div>
  );
}

function HistoryPageHeader({ onClear }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, gap: 12, flexWrap: "wrap" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Cronologia</h1>
      <button className="action-btn" onClick={onClear}>🗑️ Cancella tutto</button>
    </div>
  );
}

export default function HistoryPage({ navigate }) {
  const [voci, setVoci] = useState([]);
  const [loading, setLoading] = useState(true);
  const { addToast, ToastContainer } = useToast();

  useEffect(() => {
    api.history()
      .then(d => setVoci(d.history || []))
      .catch(() => addToast("Cronologia non disponibile"))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rimuovi = useCallback(id => rimuoviVoce(id, setVoci, addToast), [addToast]);
  const svuota = () => svuotaCronologia(voci, setVoci, addToast);

  if (loading) return <div style={{ color: "var(--text2)" }}>Caricamento cronologia...</div>;
  if (!voci.length) return <EmptyHistory />;

  return (
    <div>
      <HistoryPageHeader onClear={svuota} />
      {raggruppaPerGiorno(voci).map(gruppo => (
        <HistoryGroup key={gruppo.label} gruppo={gruppo} navigate={navigate} onRemove={rimuovi} />
      ))}
      <ToastContainer />
    </div>
  );
}
