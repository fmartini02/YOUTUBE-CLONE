import { useState, useRef, useEffect } from "react";
import SearchSuggestions, { scheduleSuggestions } from "./SearchSuggestions";

function doSearch(q, input, setInput, setShowSuggestions, navigate) {
  const query = q || input;
  if (!query.trim()) return;
  setInput(query);
  setShowSuggestions(false);
  navigate("search", { query });
}

function HeaderLeft({ navigate, setSidebarOpen }) {
  return (
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
  );
}

function SearchForm({ input, suggestions, showSuggestions, onInputChange, onSearch, onShowSuggestions, onHideSuggestions }) {
  return (
    <div className="search-form">
      <div style={{ position: "relative", flex: 1, display: "flex" }}>
        <div className="search-wrapper">
          <input
            className="search-input"
            placeholder="Cerca..."
            value={input}
            onChange={onInputChange}
            onKeyDown={e => e.key === "Enter" && onSearch()}
            onFocus={onShowSuggestions}
            onBlur={onHideSuggestions}
          />
        </div>
        <button className="search-btn" onClick={() => onSearch()}>
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>search</span>
        </button>

        {showSuggestions && suggestions.length > 0 && (
          <SearchSuggestions suggestions={suggestions} onPick={onSearch} />
        )}
      </div>
    </div>
  );
}

function AccountButton({ navigate, authStatus }) {
  const authenticated = authStatus?.authenticated;
  return (
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
  );
}

export default function Header({ navigate, currentQuery, sidebarOpen, setSidebarOpen, authStatus }) {
  const [input, setInput] = useState(currentQuery);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestTimer = useRef(null);

  useEffect(() => { setInput(currentQuery); }, [currentQuery]);

  const handleInput = e => {
    setInput(e.target.value);
    scheduleSuggestions(e.target.value, suggestTimer, setSuggestions, setShowSuggestions);
  };
  const handleSearch = q => doSearch(q, input, setInput, setShowSuggestions, navigate);

  return (
    <header className="header">
      <HeaderLeft navigate={navigate} setSidebarOpen={setSidebarOpen} />
      <SearchForm
        input={input} suggestions={suggestions} showSuggestions={showSuggestions}
        onInputChange={handleInput} onSearch={handleSearch}
        onShowSuggestions={() => suggestions.length && setShowSuggestions(true)}
        onHideSuggestions={() => setTimeout(() => setShowSuggestions(false), 150)} />
      <div className="header-right"><AccountButton navigate={navigate} authStatus={authStatus} /></div>
    </header>
  );
}
