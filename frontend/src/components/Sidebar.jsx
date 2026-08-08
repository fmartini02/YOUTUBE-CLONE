export default function Sidebar({ open, navigate, currentPage, authStatus }) {
  const mainItems = [
    { icon: "home", label: "Home", page: "home" },
    { icon: "subscriptions", label: "Iscrizioni", page: "subscriptions" },
  ];
  const subCount = authStatus?.subscription_count || 0;

  return (
    <nav className={`sidebar${open ? "" : " collapsed"}`}>
      {mainItems.map(item => (
        <div
          key={item.page}
          className={`sidebar-item${currentPage === item.page ? " active" : ""}`}
          onClick={() => navigate(item.page)}
        >
          <span className="icon material-symbols-outlined" style={{ fontSize: 20 }}>{item.icon}</span>
          <span className="sidebar-label">
            {item.label}
            {item.page === "subscriptions" && subCount > 0 && open && (
              <span style={{ marginLeft: 6, fontSize: 11, color: "var(--text3)" }}>{subCount}</span>
            )}
          </span>
        </div>
      ))}

      {/* Settings at the bottom */}
      <div className="sidebar-divider" style={{ marginTop: "auto" }} />
      <div
        className={`sidebar-item${currentPage === "settings" ? " active" : ""}`}
        onClick={() => navigate("settings")}
      >
        <span className="icon material-symbols-outlined" style={{ fontSize: 20, position: "relative" }}>
          settings
          {authStatus?.cookie?.warning && <span style={{ fontSize: 8, color: "#ffc800", marginLeft: 2 }}>●</span>}
        </span>
        <span className="sidebar-label">
          Impostazioni
          {authStatus?.cookie?.warning && <span style={{ marginLeft: 6, fontSize: 10, color: "#ffc800" }}>!</span>}
        </span>
      </div>
    </nav>
  );
}
