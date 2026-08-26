import { api } from "../../api";
import { Section } from "./settingsShared";

async function clearHistory(addToast) {
  try {
    await api.clearHistory();
    addToast("Cronologia cancellata");
  } catch {
    addToast("❌ Non sono riuscito a cancellare la cronologia");
  }
}

export default function HistorySection({ navigate, addToast }) {
  return (
    <Section title="Cronologia" icon="🕐">
      <p style={{ fontSize: 14, color: "var(--text2)", marginBottom: 12 }}>
        La cronologia è salvata localmente sul server.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="action-btn" onClick={() => navigate("history")}>🕐 Apri la cronologia</button>
        <button className="action-btn" onClick={() => clearHistory(addToast)}>🗑️ Cancella cronologia</button>
      </div>
    </Section>
  );
}
