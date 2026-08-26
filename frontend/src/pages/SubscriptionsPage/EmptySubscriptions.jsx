export default function EmptySubscriptions({ navigate }) {
  return (
    <div style={{ textAlign: "center", padding: 60, color: "var(--text2)" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>📺</div>
      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Nessuna iscrizione</div>
      <div style={{ fontSize: 14, marginBottom: 20 }}>
        Carica i cookie di YouTube per il feed delle iscrizioni, oppure collega
        l'account Google per l'elenco dei canali.
      </div>
      <button className="action-btn primary" onClick={() => navigate("settings")}>⚙️ Vai alle impostazioni</button>
    </div>
  );
}
