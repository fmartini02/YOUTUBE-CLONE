import { useState } from "react";
import Avatar from "./Avatar";

const TEXTAREA_STYLE = {
  width: "100%", resize: "vertical", background: "transparent",
  border: "none", borderBottom: "1px solid var(--border)",
  color: "var(--text)", fontSize: 14, fontFamily: "inherit",
  padding: "6px 0", outline: "none", lineHeight: 1.5,
};

function CommentBoxActions({ text, busy, onCancel, onSubmit }) {
  if (!text && !busy) return null;
  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
      {onCancel && <button className="action-btn" onClick={onCancel} disabled={busy}>Annulla</button>}
      <button className="action-btn primary" onClick={onSubmit} disabled={busy || !text.trim()}>
        {busy ? "Invio..." : "Commenta"}
      </button>
    </div>
  );
}

/** Casella di scrittura: usata sia per un commento nuovo sia per una risposta. */
export default function CommentBox({ me, placeholder, busy, onSubmit, onCancel, autoFocus }) {
  const [text, setText] = useState("");

  async function submit() {
    const t = text.trim();
    if (!t || busy) return;
    const ok = await onSubmit(t);
    if (ok) setText("");
  }

  // Ctrl/Cmd+Invio pubblica: Invio da solo va a capo, come su YouTube.
  const onKeyDown = e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } };

  return (
    <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
      <Avatar src={me?.thumbnail} name={me?.title} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <textarea
          value={text} onChange={e => setText(e.target.value)} placeholder={placeholder}
          rows={text ? 3 : 1} autoFocus={autoFocus} onKeyDown={onKeyDown} style={TEXTAREA_STYLE}
        />
        <CommentBoxActions text={text} busy={busy} onCancel={onCancel} onSubmit={submit} />
      </div>
    </div>
  );
}
