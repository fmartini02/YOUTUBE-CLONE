import { api } from "../api";

export function scheduleSuggestions(val, suggestTimer, setSuggestions, setShowSuggestions) {
  clearTimeout(suggestTimer.current);
  if (val.length <= 1) {
    setSuggestions([]);
    setShowSuggestions(false);
    return;
  }
  suggestTimer.current = setTimeout(async () => {
    try {
      const data = await api.suggestions(val);
      setSuggestions(data.suggestions || []);
      setShowSuggestions(true);
    } catch { /* niente suggerimenti, non è un errore da mostrare */ }
  }, 300);
}

export default function SearchSuggestions({ suggestions, onPick }) {
  return (
    <div style={{
      position: "absolute", top: "100%", left: 0, right: 40,
      background: "var(--bg2)", border: "1px solid var(--border)",
      borderRadius: "0 0 12px 12px", zIndex: 200, overflow: "hidden",
    }}>
      {suggestions.map((s, i) => (
        <div key={i}
          style={{ padding: "10px 16px", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", gap: 10 }}
          onMouseDown={() => onPick(s)}
          onMouseEnter={e => e.currentTarget.style.background = "var(--bg3)"}
          onMouseLeave={e => e.currentTarget.style.background = ""}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--text3)" }}>search</span> {s}
        </div>
      ))}
    </div>
  );
}
