import { EMPTY_MESSAGES } from "./homeMessages";

function EmptyHomeReason({ emptyReason, navigate }) {
  const msg = EMPTY_MESSAGES[emptyReason] || EMPTY_MESSAGES["feed-vuoto"];
  return (
    <>
      <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>{msg.title}</div>
      <div style={{ maxWidth: 460, margin: "0 auto 18px", lineHeight: 1.5 }}>{msg.body}</div>
      <button className="chip" onClick={() => navigate("settings")}>Apri Impostazioni</button>
    </>
  );
}

export default function EmptyHome({ emptyReason, navigate }) {
  return (
    <div style={{ textAlign: "center", padding: 60, color: "var(--text2)" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>{emptyReason ? "🔒" : "😶"}</div>
      {emptyReason ? <EmptyHomeReason emptyReason={emptyReason} navigate={navigate} /> : <div>Nessun video trovato.</div>}
    </div>
  );
}
