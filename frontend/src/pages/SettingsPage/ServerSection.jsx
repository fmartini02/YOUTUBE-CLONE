import { isCapacitor, getServerBase, clearServerBase } from "../../api";
import { Section } from "./settingsShared";

/** Solo nell'app Android: il frontend è nell'apk ma il server gira sul PC dell'utente. */
export default function ServerSection() {
  if (!isCapacitor()) return null;
  return (
    <Section title="Server" icon="🖥️">
      <p style={{ fontSize: 14, color: "var(--text2)", marginBottom: 12, lineHeight: 1.6 }}>
        Connesso a <strong style={{ color: "var(--text)" }}>{getServerBase()}</strong>
      </p>
      <button className="action-btn" onClick={() => { clearServerBase(); window.location.reload(); }}>
        🔄 Cambia indirizzo server
      </button>
    </Section>
  );
}
