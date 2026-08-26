export default function SubscriptionsHeader({ view, setView, subsCount }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Iscrizioni</h1>
      <div style={{ display: "flex", gap: 8 }}>
        <button className={`chip${view === "feed" ? " active" : ""}`} onClick={() => setView("feed")}>Feed</button>
        {/* La scheda canali esiste solo con l'account collegato: senza OAuth
            l'elenco non c'è, e un "Canali (0)" cliccabile porterebbe a una
            griglia vuota senza spiegazione. */}
        {subsCount > 0 && (
          <button className={`chip${view === "channels" ? " active" : ""}`} onClick={() => setView("channels")}>
            Canali ({subsCount})
          </button>
        )}
      </div>
    </div>
  );
}
