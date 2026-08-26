// Pezzi di UI riusati da più sezioni di Impostazioni.

export function Section({ title, icon, children }) {
  return (
    <div style={{ background: "var(--bg2)", borderRadius: 12, padding: 20, marginBottom: 16 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
        <span>{icon}</span> {title}
      </h2>
      {children}
    </div>
  );
}

export function StatusRow({ icon, label, sublabel, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: color || "var(--text)" }}>{label}</div>
        {sublabel && <div style={{ fontSize: 12, color: "var(--text3)" }}>{sublabel}</div>}
      </div>
    </div>
  );
}

export function PrefRow({ label, value, options, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ fontSize: 14 }}>{label}</span>
      <select className="quality-select" value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function PrefToggle({ label, sublabel, value, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", gap: 12 }}>
      <span style={{ fontSize: 14 }}>
        {label}
        {sublabel && <div style={{ fontSize: 12, color: "var(--text3)" }}>{sublabel}</div>}
      </span>
      <div
        onClick={() => onChange(!value)}
        style={{
          width: 44, height: 24, borderRadius: 12, cursor: "pointer",
          background: value ? "var(--accent)" : "var(--border)",
          position: "relative", transition: "background 0.2s",
        }}
      >
        <div style={{
          width: 18, height: 18, borderRadius: "50%", background: "#fff",
          position: "absolute", top: 3, left: value ? 23 : 3,
          transition: "left 0.2s",
        }} />
      </div>
    </div>
  );
}
