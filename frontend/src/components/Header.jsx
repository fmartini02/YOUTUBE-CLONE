import { useState, useRef, useEffect } from "react";
import { api } from "../api";

export default function Header({ navigate, currentQuery, sidebarOpen, setSidebarOpen, authStatus }) {
  const [input, setInput] = useState(currentQuery);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestTimer = useRef(null);

  useEffect(() => { setInput(currentQuery); }, [currentQuery]);

  function handleInput(e) {
    const val = e.target.value;
    setInput(val);
    clearTimeout(suggestTimer.current);
    if (val.length > 1) {
      suggestTimer.current = setTimeout(async () => {
        try {
          const data = await api.suggestions(val);
          setSuggestions(data.suggestions || []);
          setShowSuggestions(true);
        } catch {}
      }, 300);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }

  function handleSearch(q) {
    const query = q || input;
    if (!query.trim()) return;
    setInput(query);
    setShowSuggestions(false);
    navigate("search", { query });
  }

  const authenticated = authStatus?.authenticated;

  return (
    <header className="header">
      <div className="header-left">
        <button className="hamburger" onClick={() => setSidebarOpen(o => !o)}>
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>menu</span>
        </button>
        <div className="logo" onClick={() => navigate("home")}>
          <span className="material-symbols-outlined logo-icon">play_circle</span>
          <span className="logo-text">YTProxy</span>
          <span className="logo-badge">AD-FREE</span>
        </div>
      </div>

      <div className="search-form">
        <div style={{ position: "relative", flex: 1, display: "flex" }}>
          <div className="search-wrapper">
            <input
              className="search-input"
              placeholder="Cerca..."
              value={input}
              onChange={handleInput}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              onFocus={() => suggestions.length && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            />
          </div>
          <button className="search-btn" onClick={() => handleSearch()}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>search</span>
          </button>

          {showSuggestions && suggestions.length > 0 && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 40,
              background: "var(--bg2)", border: "1px solid var(--border)",
              borderRadius: "0 0 12px 12px", zIndex: 200, overflow: "hidden",
            }}>
              {suggestions.map((s, i) => (
                <div key={i}
                  style={{ padding: "10px 16px", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", gap: 10 }}
                  onMouseDown={() => handleSearch(s)}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--bg3)"}
                  onMouseLeave={e => e.currentTarget.style.background = ""}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--text3)" }}>search</span> {s}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="header-right">
        <button
          className="icon-btn"
          title={authenticated ? "Account collegato" : "Impostazioni account"}
          onClick={() => navigate("settings")}
          style={{ position: "relative" }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
            {authenticated ? "account_circle" : "settings"}
          </span>
          {authenticated && (
            <span style={{
              position: "absolute", top: 4, right: 4,
              width: 8, height: 8, borderRadius: "50%",
              background: authStatus?.cookie?.warning ? "#ffc800" : "#00c864",
              border: "1px solid var(--bg)",
            }} />
          )}
        </button>
      </div>
    </header>
  );
}
