import { useState, useEffect, useRef } from "react";
import { api, formatDuration, formatViews, formatDate, isMobile, isElectron } from "../api";
import { useToast } from "../hooks/useToast";
import { useCastContext } from "../App";
import CastButton from "../components/CastButton";

export default function VideoPage({ videoId, navigate }) {
  const [info, setInfo] = useState(null);
  const [streamData, setStreamData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quality, setQuality] = useState("best");
  const [related, setRelated] = useState([]);
  const [descExpanded, setDescExpanded] = useState(false);
  const { addToast, ToastContainer } = useToast();
  const cast = useCastContext();

  // Cast state
  const isCasting = cast?.connected && cast?.currentMedia?.videoId === videoId;

  useEffect(() => {
    if (!videoId) return;
    setLoading(true);
    setStreamData(null);

    Promise.all([
      api.videoInfo(videoId),
      api.streamUrl(videoId, quality),
    ]).then(([info, stream]) => {
      setInfo(info);
      setStreamData(stream);
      setLoading(false);
      // Salva in cronologia
      api.addHistory({ id: videoId, title: info.title, channel: info.channel, thumbnail: info.thumbnail }).catch(() => {});
      // Video correlati
      api.search(info.title.split(" ").slice(0, 4).join(" "))
        .then(d => setRelated((d.results || []).filter(v => v.id !== videoId).slice(0, 15)))
        .catch(() => {});
    }).catch(() => {
      addToast("Errore nel caricamento del video");
      setLoading(false);
    });
  }, [videoId, quality]);

  // Electron: apri in VLC
  useEffect(() => {
    if (!streamData || !isElectron()) return;
    if (window.__ytproxy_open_vlc) {
      window.__ytproxy_open_vlc(streamData.stream_url, info?.title || videoId);
    }
  }, [streamData]);

  async function handleCast() {
    if (!streamData || !cast) return;
    const success = await cast.castVideo({
      streamUrl: streamData.stream_url,
      title: info?.title || "Video",
      channel: info?.channel || "",
      thumbnail: info?.thumbnail,
      duration: info?.duration,
      videoId,
    });
    if (success) {
      addToast(`📺 In riproduzione su ${cast.deviceName}`);
    } else {
      addToast("Nessun dispositivo Cast trovato");
    }
  }

  function handleDownload() {
    const url = api.downloadUrl(videoId, quality);
    const a = document.createElement("a");
    a.href = url; a.download = (info?.title || videoId) + ".mp4"; a.click();
    addToast("⬇ Download avviato...");
  }

  async function handleOpenVLC() {
    if (!streamData) return;
    const ua = navigator.userAgent;
    if (/Android/i.test(ua)) {
      window.location.href = "intent:" + streamData.stream_url + "#Intent;type=video/mp4;end";
    } else if (/iPhone|iPad/i.test(ua)) {
      window.location.href = "vlc://" + streamData.stream_url;
    } else {
      try {
        await fetch("/api/open-vlc/" + videoId + "?quality=" + quality, { method: "POST" });
        addToast("▶ Aperto in VLC");
      } catch {
        window.open(streamData.stream_url, "_blank");
      }
    }
  }

  if (loading) return (
    <div style={{ maxWidth: 1280, margin: "0 auto" }}>
      <div className="skeleton" style={{ width: "100%", aspectRatio: "16/9", borderRadius: 12 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
        <div className="skeleton skeleton-line" style={{ height: 22 }} />
        <div className="skeleton skeleton-line short" />
      </div>
    </div>
  );

  return (
    <div className="video-page">
      <div className="video-page-layout">
        <div className="video-main">

          {/* ── Player / Cast state ────────────────── */}
          <div className="player-wrap">
            {isCasting ? (
              /* Schermata "in cast" — il video va sulla TV */
              <div style={{
                aspectRatio: "16/9", background: "#000",
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 16,
              }}>
                {info?.thumbnail && (
                  <img src={info.thumbnail} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.15 }} />
                )}
                <svg width="56" height="56" viewBox="0 0 24 24" fill="#ff0000">
                  <path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm18-7H5c-1.1 0-2 .9-2 2v3h2v-3h14v10h-5v2h5c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zM1 10v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11z"/>
                </svg>
                <div style={{ textAlign: "center", zIndex: 1 }}>
                  <div style={{ fontSize: 18, fontWeight: 600 }}>In riproduzione su</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#ff6060", marginTop: 4 }}>{cast.deviceName}</div>
                </div>
                <div style={{ display: "flex", gap: 10, zIndex: 1 }}>
                  <button className="action-btn" onClick={cast.pauseResume}>
                    {cast.castState === "playing" ? "⏸ Pausa" : "▶ Riprendi"}
                  </button>
                  <button className="action-btn" onClick={cast.stopCast}>✕ Interrompi</button>
                </div>
              </div>
            ) : !streamData ? (
              <div className="player-loading">
                <div className="spinner" />
                <span>Caricamento stream...</span>
              </div>
            ) : (
              <video
                src={streamData.stream_url}
                controls autoPlay
                style={{ width: "100%", maxHeight: "70vh", display: "block", background: "#000" }}
                onError={() => addToast("Errore stream — ricarica la pagina")}
              />
            )}
          </div>

          {/* ── Controls bar ───────────────────────── */}
          <div className="player-controls">
            <select className="quality-select" value={quality} onChange={e => setQuality(e.target.value)}>
              <option value="best">Migliore qualità</option>
              <option value="1080">1080p</option>
              <option value="720">720p</option>
              <option value="480">480p</option>
              <option value="360">360p</option>
            </select>

            {/* Cast button — appare solo su Chrome */}
            {cast?.available && (
              <CastButton
                useCastHook={cast}
                style={{ marginLeft: 4 }}
              />
            )}

            <span style={{ fontSize: 12, color: "var(--text3)", marginLeft: "auto" }}>
              {isCasting ? `📺 ${cast.deviceName}` : "🟢 Streaming diretto"}
            </span>
          </div>

          {/* ── Info ───────────────────────────────── */}
          {info && (
            <>
              <h1 className="video-title-big">{info.title}</h1>

              <div className="video-actions">
                {/* Cast — bottone principale se disponibile */}
                {cast?.available && (
                  <button
                    className={`action-btn${isCasting ? "" : " primary"}`}
                    onClick={isCasting ? cast.stopCast : handleCast}
                    disabled={!streamData}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 4 }}>
                      <path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm18-7H5c-1.1 0-2 .9-2 2v3h2v-3h14v10h-5v2h5c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zM1 10v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11z"/>
                    </svg>
                    {isCasting ? "Interrompi Cast" : "Trasmetti sulla TV"}
                  </button>
                )}

                <button className="action-btn" onClick={handleOpenVLC}>
                  {/Android|iPhone|iPad/i.test(navigator.userAgent) ? "📱 Apri nel player" : "▶ Apri in VLC"}
                </button>
                <button className="action-btn" onClick={handleDownload}>⬇ Scarica MP4</button>

                <button className="action-btn" onClick={() => {
                  navigator.clipboard?.writeText(`https://youtube.com/watch?v=${videoId}`);
                  addToast("Link copiato!");
                }}>🔗 Copia link</button>

                {info.likes && (
                  <span className="action-btn" style={{ cursor: "default" }}>
                    👍 {formatViews(info.likes).replace(" views", "")}
                  </span>
                )}
              </div>

              <div className="channel-row">
                <div className="channel-avatar">{(info.channel || "?")[0]}</div>
                <div>
                  <div className="channel-name">{info.channel}</div>
                  <div className="channel-subs">{formatViews(info.views)}</div>
                </div>
              </div>

              {info.description && (
                <div
                  className={`description-box${descExpanded ? " expanded" : ""}`}
                  onClick={() => setDescExpanded(e => !e)}
                >
                  <span style={{ fontSize: 12, color: "var(--text3)", marginBottom: 6, display: "block" }}>
                    {formatDate(info.published)} • {formatViews(info.views)}
                  </span>
                  {info.description}
                  {!descExpanded && <span style={{ color: "var(--text2)" }}> ... mostra altro</span>}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Related ──────────────────────────────── */}
        <div className="related-sidebar">
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: "var(--text2)" }}>Video correlati</h3>
          {related.map(v => (
            <div key={v.id} className="related-item" onClick={() => navigate("video", { videoId: v.id })}>
              <div className="related-thumb">
                <img src={v.thumbnail} alt={v.title} loading="lazy" />
                {v.duration && <span className="related-duration">{formatDuration(v.duration)}</span>}
              </div>
              <div className="related-meta">
                <div className="related-title">{v.title}</div>
                <div className="related-channel">{v.channel}</div>
                <div className="related-views">{formatViews(v.views)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <ToastContainer />
    </div>
  );
}
