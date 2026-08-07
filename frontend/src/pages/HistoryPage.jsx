import { useState, useEffect, useCallback } from "react";
import { api, formatDuration, timeAgo } from "../api";
import ChannelLink, { daLinkCanale } from "../components/ChannelLink";
import { useToast } from "../hooks/useToast";

/**
 * Cronologia dei video guardati.
 *
 * Il server la registrava già ad ogni apertura di un video (/api/history), ma
 * non c'era modo di vederla: la voce "Cronologia" nella barra laterale non
 * portava da nessuna parte, e l'unica cosa che si poteva fare con quei dati
 * era cancellarli dalle impostazioni.
 *
 * Impaginata come una lista e non come una griglia: qui conta *quando* si è
 * visto un video, quindi le voci vanno lette una sotto l'altra, raggruppate
 * per giorno come su YouTube.
 */

// Il giorno di un timestamp, come etichetta da mostrare in testa al gruppo.
function etichettaGiorno(ts) {
  const d = new Date(ts * 1000);
  const oggi = new Date();
  const ieri = new Date();
  ieri.setDate(oggi.getDate() - 1);
  const stessoGiorno = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (stessoGiorno(d, oggi)) return "Oggi";
  if (stessoGiorno(d, ieri)) return "Ieri";
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

function raggruppaPerGiorno(voci) {
  const gruppi = [];
  for (const v of voci) {
    const label = etichettaGiorno(v.watched_at || 0);
    const ultimo = gruppi[gruppi.length - 1];
    if (ultimo && ultimo.label === label) ultimo.voci.push(v);
    else gruppi.push({ label, voci: [v] });
  }
  return gruppi;
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

  const rimuovi = useCallback(async (id) => {
    // Ottimistico: la riga sparisce subito. Se il server rifiuta si rimette a
    // posto la lista rileggendola, invece di far finta di niente.
    setVoci(v => v.filter(x => x.id !== id));
    try {
      await api.removeHistory(id);
    } catch {
      addToast("Non sono riuscito a togliere il video dalla cronologia");
      api.history().then(d => setVoci(d.history || [])).catch(() => {});
    }
  }, [addToast]);

  async function svuota() {
    const precedenti = voci;
    setVoci([]);
    try {
      await api.clearHistory();
      addToast("Cronologia cancellata");
    } catch {
      setVoci(precedenti);
      addToast("Non sono riuscito a cancellare la cronologia");
    }
  }

  if (loading) return <div style={{ color: "var(--text2)" }}>Caricamento cronologia...</div>;

  if (!voci.length) return (
    <div style={{ textAlign: "center", padding: 60, color: "var(--text2)" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🕐</div>
      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Nessun video nella cronologia</div>
      <div style={{ fontSize: 14 }}>I video che guardi finiscono qui.</div>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Cronologia</h1>
        <button className="action-btn" onClick={svuota}>🗑️ Cancella tutto</button>
      </div>

      {raggruppaPerGiorno(voci).map(gruppo => (
        <section key={gruppo.label} style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--text2)", marginBottom: 12 }}>
            {gruppo.label}
          </h2>
          <div className="history-list">
            {gruppo.voci.map(v => (
              <div
                key={v.id}
                className="history-row"
                onClick={e => {
                  if (daLinkCanale(e)) return;
                  navigate("video", { videoId: v.id });
                }}
              >
                <div className="history-thumb">
                  <img
                    src={v.thumbnail || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`}
                    alt={v.title}
                    loading="lazy"
                  />
                  {v.duration ? <span className="duration">{formatDuration(v.duration)}</span> : null}
                </div>
                <div className="history-meta">
                  <div className="history-title">{v.title}</div>
                  <div className="history-sub">
                    {v.channel_id
                      ? <ChannelLink channelId={v.channel_id} name={v.channel} navigate={navigate} />
                      : <span>{v.channel}</span>}
                  </div>
                  {/* timeAgo vuole un timestamp unix in secondi, come quello
                      che salva il server. */}
                  {v.watched_at ? (
                    <div className="history-sub">Guardato {timeAgo(v.watched_at)}</div>
                  ) : null}
                </div>
                <button
                  className="history-remove"
                  title="Togli dalla cronologia"
                  aria-label="Togli dalla cronologia"
                  onClick={e => { e.stopPropagation(); rimuovi(v.id); }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}
      <ToastContainer />
    </div>
  );
}
