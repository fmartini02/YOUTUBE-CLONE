/**
 * CastBar — barra in basso che appare quando stai trasmettendo
 * Mostra titolo, stato e controlli base (play/pause, stop)
 */

export default function CastBar({ useCastHook }) {
  const { connected, deviceName, castState, currentMedia, pauseResume, stopCast } = useCastHook;

  if (!connected || !currentMedia) return null;

  const isPlaying = castState === "playing";
  const isBuffering = castState === "buffering";

  return (
    <div style={{
      position: "fixed",
      bottom: 0, left: 0, right: 0,
      zIndex: 500,
      background: "rgba(15,15,15,0.97)",
      borderTop: "1px solid rgba(255,0,0,0.3)",
      padding: "10px 20px",
      display: "flex",
      alignItems: "center",
      gap: 14,
      backdropFilter: "blur(12px)",
    }}>
      {/* Thumbnail */}
      {currentMedia.thumbnail && (
        <img
          src={currentMedia.thumbnail}
          alt=""
          style={{ width: 48, height: 27, borderRadius: 4, objectFit: "cover", flexShrink: 0 }}
        />
      )}

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 500, color: "#fff",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {currentMedia.title}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,100,100,0.8)", display: "flex", alignItems: "center", gap: 4 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm18-7H5c-1.1 0-2 .9-2 2v3h2v-3h14v10h-5v2h5c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zM1 10v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11z"/>
          </svg>
          {isBuffering ? "Buffering..." : `In riproduzione su ${deviceName}`}
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={pauseResume}
          disabled={isBuffering}
          style={{
            background: "rgba(255,255,255,0.1)", border: "none",
            color: "#fff", width: 36, height: 36, borderRadius: "50%",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, transition: "background 0.2s",
          }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.2)"}
          onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
        >
          {isBuffering ? "⏳" : isPlaying ? "⏸" : "▶"}
        </button>

        <button
          onClick={stopCast}
          title="Interrompi trasmissione"
          style={{
            background: "rgba(255,0,0,0.15)", border: "1px solid rgba(255,0,0,0.3)",
            color: "#ff6060", width: 36, height: 36, borderRadius: "50%",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, transition: "background 0.2s",
          }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,0,0,0.3)"}
          onMouseLeave={e => e.currentTarget.style.background = "rgba(255,0,0,0.15)"}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
