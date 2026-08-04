/**
 * CastBar — barra in basso che appare quando stai trasmettendo
 * Mostra titolo, stato, controlli (prev/play-pause/next/stop) e la coda
 */

import { useState } from "react";

export default function CastBar({ useCastHook, navigate }) {
  const [queueOpen, setQueueOpen] = useState(false);
  const {
    connected, deviceName, castState, currentMedia,
    queue, queueIndex, pauseResume, stopCast, next, previous,
    playQueueItem, removeFromQueue,
  } = useCastHook;

  if (!connected || !currentMedia) return null;

  const isPlaying = castState === "playing";
  const isBuffering = castState === "buffering";
  const hasNext = queueIndex >= 0 && queueIndex < queue.length - 1;
  const hasPrev = queueIndex > 0;

  const btnStyle = {
    background: "rgba(255,255,255,0.1)", border: "none",
    color: "#fff", width: 36, height: 36, borderRadius: "50%",
    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 15, transition: "background 0.2s", flexShrink: 0,
  };

  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 500 }}>
      {/* Pannello coda */}
      {queueOpen && queue.length > 0 && (
        <div style={{
          background: "rgba(15,15,15,0.98)", borderTop: "1px solid rgba(255,0,0,0.3)",
          maxHeight: 320, overflowY: "auto", backdropFilter: "blur(12px)",
        }}>
          <div style={{ padding: "10px 20px", fontSize: 12, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase" }}>
            Coda — {queue.length} video
          </div>
          {queue.map((v, i) => (
            <div
              key={v.itemId ?? i}
              onClick={() => playQueueItem(v.itemId)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "6px 20px",
                cursor: "pointer", background: i === queueIndex ? "rgba(255,0,0,0.1)" : "transparent",
              }}
              onMouseEnter={e => { if (i !== queueIndex) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
              onMouseLeave={e => { if (i !== queueIndex) e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ width: 16, fontSize: 12, color: i === queueIndex ? "#ff6060" : "var(--text3)", flexShrink: 0 }}>
                {i === queueIndex ? "▶" : i + 1}
              </span>
              {v.thumbnail && <img src={v.thumbnail} alt="" style={{ width: 40, height: 23, borderRadius: 3, objectFit: "cover", flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {v.title}
              </div>
              {v.itemId != null && (
                <button
                  onClick={e => { e.stopPropagation(); removeFromQueue(v.itemId); }}
                  title="Rimuovi dalla coda"
                  style={{ background: "none", border: "none", color: "var(--text3)", cursor: "pointer", fontSize: 14, padding: 4, flexShrink: 0 }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{
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
            style={{ width: 48, height: 27, borderRadius: 4, objectFit: "cover", flexShrink: 0, cursor: currentMedia.videoId ? "pointer" : "default" }}
            onClick={() => currentMedia.videoId && navigate?.("video", { videoId: currentMedia.videoId })}
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
          <button onClick={previous} disabled={!hasPrev} title="Precedente" style={{ ...btnStyle, opacity: hasPrev ? 1 : 0.3, cursor: hasPrev ? "pointer" : "default" }}>⏮</button>

          <button
            onClick={pauseResume}
            disabled={isBuffering}
            style={btnStyle}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.2)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
          >
            {isBuffering ? "⏳" : isPlaying ? "⏸" : "▶"}
          </button>

          <button onClick={next} disabled={!hasNext} title="Successivo" style={{ ...btnStyle, opacity: hasNext ? 1 : 0.3, cursor: hasNext ? "pointer" : "default" }}>⏭</button>

          {queue.length > 1 && (
            <button
              onClick={() => setQueueOpen(o => !o)}
              title="Coda"
              style={{ ...btnStyle, width: "auto", borderRadius: 18, padding: "0 12px", gap: 6, fontSize: 12 }}
            >
              📋 {queue.length}
            </button>
          )}

          <button
            onClick={stopCast}
            title="Interrompi trasmissione"
            style={{
              background: "rgba(255,0,0,0.15)", border: "1px solid rgba(255,0,0,0.3)",
              color: "#ff6060", width: 36, height: 36, borderRadius: "50%",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, transition: "background 0.2s", flexShrink: 0,
            }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,0,0,0.3)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(255,0,0,0.15)"}
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
