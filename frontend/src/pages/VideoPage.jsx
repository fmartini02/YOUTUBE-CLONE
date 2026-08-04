import { useState, useEffect, useRef, useMemo } from "react";
import { api, formatDuration, formatViews, formatDate, timeAgo, isCastableOrigin } from "../api";
import { useToast } from "../hooks/useToast";
import { useCastContext } from "../App";
import CastButton from "../components/CastButton";
import { CAST_UNAVAILABLE_MESSAGE } from "../hooks/useCast.jsx";
import { useChannelAvatars } from "../hooks/useChannelAvatars";

export default function VideoPage({ videoId, navigate }) {
  const [info, setInfo] = useState(null);
  const [quality, setQuality] = useState("best");
  const [related, setRelated] = useState([]);
  const [descExpanded, setDescExpanded] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentCount, setCommentCount] = useState(null);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentSort, setCommentSort] = useState("top"); // top (più pertinenti) | new (più recenti)
  const [subtitleLangs, setSubtitleLangs] = useState([]);
  const [subtitleLang, setSubtitleLang] = useState("");
  const [subtitleSize, setSubtitleSize] = useState("normal");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const playerWrapRef = useRef(null);
  const { addToast, ToastContainer } = useToast();
  const cast = useCastContext();

  // Cast state
  const isCasting = cast?.connected && cast?.currentMedia?.videoId === videoId;

  // Logo del canale: /api/watch non lo include (yt-dlp dà solo la copertina del
  // video), quindi lo risolviamo con lo stesso hook delle card, passandogli il
  // singolo video come lista di uno.
  const channelAsList = useMemo(() => (info?.channel_id ? [info] : []), [info]);
  const channelAvatar = useChannelAvatars(channelAsList)[info?.channel_id];

  // I metadati (titolo/descrizione/correlati) arrivano con /api/watch, ma il
  // player NON aspetta più questa chiamata: l'URL del player (/api/mux) si
  // costruisce subito da videoId+quality, senza bisogno di sapere nient'altro.
  // Prima erano in serie (aspetta i metadati, POI fai partire il player) e il
  // video restava fermo per il tempo di entrambe le richieste sommate.
  useEffect(() => {
    if (!videoId) return;
    setInfo(null);

    api.watch(videoId, quality).then(data => {
      setInfo(data);
      // Salva in cronologia
      api.addHistory({ id: videoId, title: data.title, channel: data.channel, thumbnail: data.thumbnail }).catch(() => {});
      // Video correlati
      api.search(data.title.split(" ").slice(0, 4).join(" "))
        .then(d => setRelated((d.results || []).filter(v => v.id !== videoId).slice(0, 15)))
        .catch(() => {});
    }).catch(() => {
      addToast("Errore nel caricamento dei dettagli del video");
    });
  }, [videoId, quality]);

  // Commenti: chiamata separata (non dipende da 'quality') e non bloccante —
  // parte in parallelo, il player non aspetta che finisca.
  useEffect(() => {
    if (!videoId) return;
    setComments([]);
    setCommentsLoading(true);
    api.comments(videoId).then(d => {
      setComments(d.comments || []);
      setCommentCount(d.comment_count);
      setCommentsLoading(false);
    }).catch(() => setCommentsLoading(false));
  }, [videoId]);

  // Lingue sottotitoli disponibili — anche questa non bloccante.
  useEffect(() => {
    if (!videoId) return;
    setSubtitleLang("");
    setSubtitleLangs([]);
    api.subtitleLanguages(videoId).then(d => setSubtitleLangs(d.languages || [])).catch(() => {});
  }, [videoId]);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      playerWrapRef.current?.requestFullscreen().catch(() => {});
    }
  }

  // Il tag <video> ha un suo bottone nativo per lo schermo intero (nei
  // controlli standard del browser, distinto dal nostro ⛶ nell'overlay): se
  // l'utente usa QUELLO, va a schermo intero solo il <video>, e l'overlay con
  // ingranaggio/sottotitoli — che vive nel contenitore attorno — sparisce.
  // Se rileviamo che è andato a schermo intero solo il video, lo correggiamo
  // passando al contenitore, così l'overlay resta sempre raggiungibile.
  useEffect(() => {
    function onFullscreenChange() {
      const wrap = playerWrapRef.current;
      const videoEl = wrap?.querySelector("video");
      if (wrap && videoEl && document.fullscreenElement === videoEl) {
        document.exitFullscreen().then(() => wrap.requestFullscreen().catch(() => {}));
      }
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  async function handleCast() {
    if (!cast) return;
    if (!isCastableOrigin()) {
      addToast("Per trasmettere apri l'app dall'IP di rete (es. http://192.168.1.11:8090), non da localhost");
      return;
    }
    const success = await cast.castVideo({
      streamUrl: api.castUrl(videoId, quality),
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

  async function handleAddToQueue() {
    if (!cast) return;
    if (!isCastableOrigin()) {
      addToast("Per trasmettere apri l'app dall'IP di rete (es. http://192.168.1.11:8090), non da localhost");
      return;
    }
    const ok = await cast.addToQueue({
      streamUrl: api.castUrl(videoId, quality),
      title: info?.title || "Video",
      channel: info?.channel || "",
      thumbnail: info?.thumbnail,
      duration: info?.duration,
      videoId,
    });
    addToast(ok ? "➕ Aggiunto alla coda" : "Errore nell'aggiunta alla coda");
  }

  function handleDownload() {
    const url = api.downloadUrl(videoId, quality);
    const a = document.createElement("a");
    a.href = url; a.download = (info?.title || videoId) + ".mp4"; a.click();
    addToast("⬇ Download avviato...");
  }

  // Ordinamento lato client — i commenti sono già tutti scaricati, non serve
  // una nuova richiesta al server per cambiare ordine.
  const sortedComments = useMemo(() => {
    const list = [...comments];
    if (commentSort === "new") list.sort((a, b) => (b.published || 0) - (a.published || 0));
    else list.sort((a, b) => (b.likes || 0) - (a.likes || 0));
    return list;
  }, [comments, commentSort]);

  return (
    <div className="video-page">
      <div className="video-page-layout">
        <div className="video-main">

          {/* ── Player / Cast state ────────────────── */}
          <div className="player-wrap" ref={playerWrapRef}>
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
            ) : (
              // Nessuna attesa dei metadati: l'URL si costruisce subito da
              // videoId+quality. Lo spinner di caricamento è quello nativo
              // del browser (attributo controls) mentre bufferizza.
              <>
                <video
                  key={`${videoId}-${quality}`}
                  src={api.muxUrl(videoId, quality)}
                  controls autoPlay
                  className={`subtitle-size-${subtitleSize}`}
                  style={{ width: "100%", aspectRatio: "16/9", maxHeight: "88vh", display: "block", background: "#000" }}
                  onError={() => addToast("Errore stream — ricarica la pagina")}
                >
                  {subtitleLang && (
                    <track
                      key={subtitleLang}
                      kind="subtitles"
                      src={api.subtitleUrl(videoId, subtitleLang)}
                      srcLang={subtitleLang}
                      label={subtitleLangs.find(l => l.code === subtitleLang)?.name || subtitleLang}
                      default
                    />
                  )}
                </video>

                {/* Overlay qualità/sottotitoli: vive DENTRO lo stesso elemento
                    che va a schermo intero (player-wrap), a differenza del
                    vecchio menu qualità esterno che spariva in fullscreen. */}
                <div className="player-settings">
                  <button
                    className="player-settings-btn"
                    onClick={() => setSettingsOpen(o => !o)}
                    title="Impostazioni"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>settings</span>
                  </button>
                  <button className="player-settings-btn" onClick={toggleFullscreen} title="Schermo intero">
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>fullscreen</span>
                  </button>
                </div>

                {settingsOpen && (
                  <>
                    <div className="player-settings-backdrop" onClick={() => setSettingsOpen(false)} />
                    <div className="player-settings-menu">
                      <div className="player-settings-section">
                        <div className="player-settings-label">Qualità</div>
                        {[["best", "Migliore qualità"], ["1080", "1080p"], ["720", "720p"], ["480", "480p"], ["360", "360p"]].map(([v, l]) => (
                          <div
                            key={v}
                            className={`player-settings-item${quality === v ? " active" : ""}`}
                            onClick={() => { setQuality(v); setSettingsOpen(false); }}
                          >
                            {l}
                          </div>
                        ))}
                      </div>

                      <div className="player-settings-section">
                        <div className="player-settings-label">Sottotitoli</div>
                        <div
                          className={`player-settings-item${!subtitleLang ? " active" : ""}`}
                          onClick={() => { setSubtitleLang(""); setSettingsOpen(false); }}
                        >
                          Off
                        </div>
                        {subtitleLangs.map(l => (
                          <div
                            key={l.code}
                            className={`player-settings-item${subtitleLang === l.code ? " active" : ""}`}
                            onClick={() => { setSubtitleLang(l.code); setSettingsOpen(false); }}
                          >
                            {l.name}{l.auto ? " (auto)" : ""}
                          </div>
                        ))}
                        {subtitleLangs.length === 0 && (
                          <div className="player-settings-item" style={{ color: "var(--text3)", cursor: "default" }}>
                            Nessun sottotitolo disponibile
                          </div>
                        )}
                      </div>

                      {subtitleLang && (
                        <div className="player-settings-section">
                          <div className="player-settings-label">Dimensione sottotitoli</div>
                          {[["small", "Piccoli"], ["normal", "Normali"], ["large", "Grandi"]].map(([v, l]) => (
                            <div
                              key={v}
                              className={`player-settings-item${subtitleSize === v ? " active" : ""}`}
                              onClick={() => setSubtitleSize(v)}
                            >
                              {l}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {/* ── Controls bar ───────────────────────── */}
          <div className="player-controls">
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
          {!info && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
              <div className="skeleton skeleton-line" style={{ height: 22 }} />
              <div className="skeleton skeleton-line short" />
            </div>
          )}
          {info && (
            <>
              <h1 className="video-title-big">{info.title}</h1>

              {/* Canale a sinistra, azioni a destra sulla stessa riga — come YouTube */}
              <div className="video-meta-row">
                <div className="channel-row">
                  <div className="channel-avatar">
                    {channelAvatar
                      ? <img src={channelAvatar} alt={info.channel} referrerPolicy="no-referrer" />
                      : (info.channel || "?")[0]}
                  </div>
                  <div>
                    <div className="channel-name">{info.channel}</div>
                    <div className="channel-subs">{formatViews(info.views)}</div>
                  </div>
                </div>

                <div className="video-actions">
                  {info.likes && (
                    <span className="action-btn" style={{ cursor: "default" }}>
                      👍 {formatViews(info.likes).replace(" views", "")}
                    </span>
                  )}

                  {/* Cast — sempre visibile: se non è disponibile spiega il
                      perché invece di sparire senza dare spiegazioni. */}
                  <button
                    className={`action-btn${isCasting || !cast?.available ? "" : " primary"}`}
                    style={cast?.available ? undefined : { opacity: 0.6 }}
                    onClick={
                      !cast?.available
                        ? () => addToast(CAST_UNAVAILABLE_MESSAGE[cast?.unavailableReason] || "Trasmissione non disponibile in questo browser.")
                        : isCasting ? cast.stopCast : handleCast
                    }
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 4 }}>
                      <path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm18-7H5c-1.1 0-2 .9-2 2v3h2v-3h14v10h-5v2h5c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zM1 10v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11z"/>
                    </svg>
                    {isCasting ? "Interrompi Cast" : "Trasmetti sulla TV"}
                  </button>

                  {cast?.available && (
                    <button className="action-btn" onClick={handleAddToQueue}>
                      ➕ Coda
                    </button>
                  )}

                  <button className="action-btn" onClick={() => {
                    navigator.clipboard?.writeText(`https://youtube.com/watch?v=${videoId}`);
                    addToast("Link copiato!");
                  }}>🔗 Condividi</button>

                  <button className="action-btn" onClick={handleDownload}>⬇ Scarica</button>
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

              {/* ── Commenti ─────────────────────────── */}
              <div style={{ marginTop: 24 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600 }}>
                    Commenti {commentCount != null && <span style={{ color: "var(--text3)", fontWeight: 400 }}>({formatViews(commentCount).replace(" views", "")})</span>}
                  </h3>
                  {comments.length > 1 && (
                    <select
                      className="quality-select"
                      value={commentSort}
                      onChange={e => setCommentSort(e.target.value)}
                    >
                      <option value="top">Più pertinenti</option>
                      <option value="new">Più recenti</option>
                    </select>
                  )}
                </div>

                {commentsLoading ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} style={{ display: "flex", gap: 12 }}>
                        <div className="skeleton" style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0 }} />
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                          <div className="skeleton skeleton-line short" />
                          <div className="skeleton skeleton-line" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : comments.length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--text3)" }}>
                    Nessun commento disponibile per questo video.
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                    {sortedComments.map(c => (
                      <div key={c.id} style={{ display: "flex", gap: 12 }}>
                        <div className="channel-avatar" style={{ width: 36, height: 36, fontSize: 13, flexShrink: 0, overflow: "hidden" }}>
                          {c.author_thumbnail
                            ? <img src={c.author_thumbnail} alt={c.author} referrerPolicy="no-referrer" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            : (c.author || "?").replace("@", "")[0]}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 13, fontWeight: 500 }}>{c.author}</span>
                            {c.author_is_uploader && (
                              <span style={{ fontSize: 10, color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 4, padding: "0 4px" }}>
                                AUTORE
                              </span>
                            )}
                            <span style={{ fontSize: 12, color: "var(--text3)" }}>{timeAgo(c.published)}</span>
                          </div>
                          <div style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                            {c.text}
                          </div>
                          {c.likes > 0 && (
                            <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 6 }}>
                              👍 {c.likes}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
