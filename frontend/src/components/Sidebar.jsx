import { WATCH_LATER_ID } from "../api";

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
// "Guarda più tardi" è la pagina playlist sulla coda locale (id WL): ha dei
// parametri, quindi è attiva solo su QUELLA playlist, non su tutte.
function mainSidebarItems(subCount, open) {
  return [
    { icon: "home", label: "Home", page: "home" },
    { icon: "subscriptions", label: "Iscrizioni", page: "subscriptions",
      labelExtra: subCount > 0 && open && <span style={{ marginLeft: 6, fontSize: 11, color: "var(--text3)" }}>{subCount}</span> },
    { icon: "history", label: "Cronologia", page: "history" },
    { icon: "watch_later", label: "Guarda più tardi", page: "playlist", params: { listId: WATCH_LATER_ID } },
  ];
}

function isActive(item, currentPage, currentParams) {
  if (currentPage !== item.page) return false;
  return !item.params || item.params.listId === currentParams?.listId;
}

export default function Sidebar({ open, navigate, currentPage, currentParams, authStatus }) {
  const warning = authStatus?.cookie?.warning;
  const items = mainSidebarItems(authStatus?.subscription_count || 0, open);

  return (
    <nav className={`sidebar${open ? "" : " collapsed"}`}>
      {items.map(item => (
        <SidebarItem key={item.label} icon={item.icon} label={item.label} labelExtra={item.labelExtra}
          active={isActive(item, currentPage, currentParams)} onClick={() => navigate(item.page, item.params)} />
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
