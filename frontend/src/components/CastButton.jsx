/**
 * CastButton — il pulsante Cast che appare ovunque nel'app
 * Si mostra solo se il Cast SDK è disponibile (Chrome, Android Chrome)
 */

export default function CastButton({ useCastHook, style = {} }) {
  const { available, connected, deviceName, openDialog } = useCastHook;

  if (!available) return null;

  return (
    <button
      onClick={openDialog}
      title={connected ? `Cast attivo: ${deviceName}` : "Trasmetti su TV"}
      style={{
        background: connected ? "rgba(255,0,0,0.15)" : "none",
        border: connected ? "1px solid rgba(255,0,0,0.4)" : "none",
        color: connected ? "#ff6060" : "var(--text)",
        cursor: "pointer",
        padding: "6px 10px",
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 13,
        transition: "all 0.2s",
        ...style,
      }}
    >
      {/* Cast icon SVG */}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm18-7H5c-1.1 0-2 .9-2 2v3h2v-3h14v10h-5v2h5c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zM1 10v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11z"/>
      </svg>
      {connected && <span>{deviceName}</span>}
    </button>
  );
}
