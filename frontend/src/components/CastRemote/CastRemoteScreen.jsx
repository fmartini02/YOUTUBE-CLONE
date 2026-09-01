import { makeTapHandlers } from "./castRemoteHelpers";

const SCREEN_STYLE = {
  position: "relative", aspectRatio: "16/9", background: "#000", overflow: "hidden",
  display: "flex", alignItems: "center", justifyContent: "center",
  touchAction: "manipulation", userSelect: "none",
};

function StatusText({ playerState, deviceName }) {
  const label = playerState === "buffering" ? "Caricamento su" : "In riproduzione su";
  return (
    <div style={{ textAlign: "center", zIndex: 1, padding: "0 16px" }}>
      <div style={{ fontSize: 18, fontWeight: 600, color: "#fff" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "#ff6060", marginTop: 4 }}>{deviceName || "TV"}</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 10 }}>
        Doppio tocco ai lati per ±10s · al centro per pausa
      </div>
    </div>
  );
}

/** Area 16:9 scura: sfondo miniatura, stato, e le zone per il doppio tocco. */
export default function CastRemoteScreen({ thumbnail, deviceName, playerState, onSkip, onTogglePlay }) {
  return (
    <div style={SCREEN_STYLE} {...makeTapHandlers(onSkip, onTogglePlay)}>
      {thumbnail && (
        <img
          src={thumbnail} alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.15 }}
        />
      )}
      <svg width="52" height="52" viewBox="0 0 24 24" fill="#ff0000" style={{ position: "absolute", top: 16, left: 16, opacity: 0.5 }}>
        <path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm18-7H5c-1.1 0-2 .9-2 2v3h2v-3h14v10h-5v2h5c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zM1 10v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11z" />
      </svg>
      <StatusText playerState={playerState} deviceName={deviceName} />
    </div>
  );
}
