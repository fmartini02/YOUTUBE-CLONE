function SidebarItem({ icon, label, active, onClick, iconExtra, labelExtra }) {
  return (
    <div className={`sidebar-item${active ? " active" : ""}`} onClick={onClick}>
      <span className="icon material-symbols-outlined" style={iconExtra ? { fontSize: 20, position: "relative" } : { fontSize: 20 }}>
        {icon}
        {iconExtra}
      </span>
      <span className="sidebar-label">
        {label}
        {labelExtra}
      </span>
    </div>
  );
}

// Solo voci che portano da qualche parte: le decorative (Download, Video
// piaciuti, Esplora) sono state tolte perché non facevano niente. Cronologia
// sta qui e non in una sezione "Tu" a parte proprio per la stessa ragione —
// è una pagina vera, quindi merita la barra stretta come le altre due.
function mainSidebarItems(subCount, open) {
  return [
    { icon: "home", label: "Home", page: "home" },
    { icon: "subscriptions", label: "Iscrizioni", page: "subscriptions",
      labelExtra: subCount > 0 && open && <span style={{ marginLeft: 6, fontSize: 11, color: "var(--text3)" }}>{subCount}</span> },
    { icon: "history", label: "Cronologia", page: "history" },
  ];
}

export default function Sidebar({ open, navigate, currentPage, authStatus }) {
  const warning = authStatus?.cookie?.warning;
  const items = mainSidebarItems(authStatus?.subscription_count || 0, open);

  return (
    <nav className={`sidebar${open ? "" : " collapsed"}`}>
      {items.map(item => (
        <SidebarItem key={item.page} icon={item.icon} label={item.label} labelExtra={item.labelExtra}
          active={currentPage === item.page} onClick={() => navigate(item.page)} />
      ))}
      <div className="sidebar-divider" style={{ marginTop: "auto" }} />
      <SidebarItem
        icon="settings" label="Impostazioni" active={currentPage === "settings"}
        onClick={() => navigate("settings")}
        iconExtra={warning && <span style={{ fontSize: 8, color: "#ffc800", marginLeft: 2 }}>●</span>}
        labelExtra={warning && <span style={{ marginLeft: 6, fontSize: 10, color: "#ffc800" }}>!</span>}
      />
    </nav>
  );
}
