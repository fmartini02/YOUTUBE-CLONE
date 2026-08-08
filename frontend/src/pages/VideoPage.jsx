import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { api, formatDuration, formatViews, formatCompact, formatDate } from "../api";
import { useToast } from "../hooks/useToast";
import { useCastContext } from "../App";
import CastButton from "../components/CastButton";
import Comments from "../components/Comments";
import VideoPlayer from "../components/VideoPlayer";
import ChannelLink, { daLinkCanale } from "../components/ChannelLink";
import SubscribeButton from "../components/SubscribeButton";
import { useChannelAvatars } from "../hooks/useChannelAvatars";
import { useInfiniteScroll } from "../hooks/useInfiniteScroll";

// Quanti correlati per richiesta: il mix di YouTube arriva a blocchi di ~25,
// chiederne 20 alla volta tiene ogni richiesta a una sola continuazione.
const RELATED_PAGE_SIZE = 20;

const THEATER_KEY = "ytproxy_theater";

export default function VideoPage({ videoId, navigate, authStatus, onSubsChange }) {
  const [info, setInfo] = useState(null);
  const [quality, setQuality] = useState("best");
  const [related, setRelated] = useState([]);
  const [relatedHasMore, setRelatedHasMore] = useState(false);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const relatedPageRef = useRef(0);
  const [descExpanded, setDescExpanded] = useState(false);
  const [subtitleLangs, setSubtitleLangs] = useState([]);
  const [subtitleLang, setSubtitleLang] = useState("");
  const [subtitleSize, setSubtitleSize] = useState("normal");
  // Modalità cinema: la scelta vale per tutti i video, come su YouTube, quindi
  // sopravvive al cambio pagina e al riavvio.
  const [theater, setTheater] = useState(() => localStorage.getItem(THEATER_KEY) === "1");
  const { addToast, ToastContainer } = useToast();
  const cast = useCastContext();

  // Cast: quando questo video sta girando sulla TV il player locale lascia il
  // posto a una schermata di stato — riprodurlo anche qui vorrebbe dire
  // scaricare due volte lo stesso stream.
  const isCasting = cast?.connected && cast?.castingVideoId === videoId;

  // Logo del canale: /api/watch non lo include (yt-dlp dà solo la copertina del
  // video), quindi lo risolviamo con lo stesso hook delle card, passandogli il
  // singolo video come lista di uno.
  const channelAsList = useMemo(() => (info?.channel_id ? [info] : []), [info]);
  const channelAvatar = useChannelAvatars(channelAsList)[info?.channel_id];


  // I metadati (titolo/descrizione/durata/correlati) arrivano con /api/watch,
  // ma il player NON aspetta questa chiamata: l'URL del flusso (/api/mux) si
  // costruisce subito da videoId+quality, senza bisogno di sapere nient'altro.
  // Prima erano in serie (aspetta i metadati, POI fai partire il player) e il
  // video restava fermo per il tempo di entrambe le richieste sommate.
  //
  // Non dipende da `quality`: nessuno di questi campi cambia con la qualità, e
  // rifare l'estrazione ad ogni cambio azzerava `info` — cioè la durata, cioè
  // la barra di avanzamento — per il tempo della richiesta.
  useEffect(() => {
    if (!videoId) return;
    setInfo(null);

    api.watch(videoId).then(data => {
      setInfo(data);
      // Salva in cronologia
      api.addHistory({ id: videoId, title: data.title, channel: data.channel, thumbnail: data.thumbnail }).catch(() => {});
    }).catch(() => {
      addToast("Errore nel caricamento dei dettagli del video");
    });
  }, [videoId]);

  // Correlati: il "Mix" che YouTube costruisce a partire da questo video.
  // Effetto separato da /api/watch perché non dipende dalla qualità e perché
  // si ricarica solo al cambio di video.
  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    setRelated([]);
    setRelatedHasMore(false);
    relatedPageRef.current = 0;

    api.related(videoId, RELATED_PAGE_SIZE, 0).then(d => {
      if (cancelled) return;
      setRelated((d.results || []).filter(v => v.id !== videoId));
      setRelatedHasMore(!!d.has_more);
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [videoId]);

  const loadMoreRelated = useCallback(async () => {
    if (relatedLoading || !relatedHasMore) return;
    setRelatedLoading(true);
    try {
      const next = relatedPageRef.current + 1;
      const d = await api.related(videoId, RELATED_PAGE_SIZE, next * RELATED_PAGE_SIZE);
      relatedPageRef.current = next;
      setRelated(prev => {
        // Il mix ripropone periodicamente gli stessi video (incluso quello in
        // riproduzione): senza dedup si avrebbero chiavi React duplicate.
        const seen = new Set([videoId, ...prev.map(v => v.id)]);
        return [...prev, ...(d.results || []).filter(v => !seen.has(v.id))];
      });
      setRelatedHasMore(!!d.has_more);
    } catch {
      setRelatedHasMore(false);
    } finally {
      setRelatedLoading(false);
    }
  }, [videoId, relatedHasMore, relatedLoading]);

  const relatedSentinelRef = useInfiniteScroll({
    hasMore: relatedHasMore,
    loading: relatedLoading,
    onLoadMore: loadMoreRelated,
  });

  // Lingue sottotitoli disponibili — anche questa non bloccante.
  useEffect(() => {
    if (!videoId) return;
    setSubtitleLang("");
    setSubtitleLangs([]);
    api.subtitleLanguages(videoId).then(d => setSubtitleLangs(d.languages || [])).catch(() => {});
  }, [videoId]);

  function toggleTheater() {
    setTheater(t => {
      localStorage.setItem(THEATER_KEY, t ? "0" : "1");
      return !t;
    });
  }

  // Video da mandare al Chromecast. L'URL si costruisce in modo sincrono da
  // videoId+quality (compat=1 → H.264/AAC, gli unici codec che ogni
  // Chromecast sa decodificare): il rimux lato server parte solo quando la TV
  // richiede davvero lo stream.
  const castMedia = useMemo(() => ({
    streamUrl: api.castUrl(videoId, quality),
    title: info?.title || "Video",
    channel: info?.channel || "",
    thumbnail: info?.thumbnail,
    duration: info?.duration,
    videoId,
  }), [videoId, quality, info]);

  function handleDownload() {
    const url = api.downloadUrl(videoId, quality);
    const a = document.createElement("a");
    a.href = url; a.download = (info?.title || videoId) + ".mp4"; a.click();
    addToast("⬇ Download avviato...");
  }

  return (
    <div className="video-page">
      <div className={`video-page-layout${theater ? " theater" : ""}`}>
        {/* video-left tiene insieme player e commenti — sul desktop sono la
            stessa colonna — ma li lascia separabili: sul telefono i correlati
            vanno FRA i due, non dopo i commenti (vedi App.css, RESPONSIVE). */}
        <div className="video-left">
          <div className="video-main">

            {/* ── Player / Cast state ────────────────── */}
            {isCasting ? (
              <div className="player-wrap">
                {/* Schermata "in cast" — il video va sulla TV */}
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
                    <div style={{ fontSize: 18, fontWeight: 600 }}>
                      {cast.playerState === "buffering" ? "Caricamento su" : "In riproduzione su"}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "#ff6060", marginTop: 4 }}>{cast.deviceName}</div>
                    {/* Play/pausa e volume si comandano dal telecomando della TV
                        o da Google Home: qui l'unico comando cast è il bottone
                        "Interrompi" nella riga azioni qui sotto. */}
                    <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 10 }}>
                      Usa il telecomando della TV per mettere in pausa
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Il player non aspetta i metadati: l'URL del flusso si costruisce
                 subito da videoId+quality. La durata arriva dopo, con /api/watch,
                 e serve solo alla barra di avanzamento. */
              <VideoPlayer
                videoId={videoId}
                quality={quality}
                onQualityChange={setQuality}
                duration={info?.duration}
                subtitleLangs={subtitleLangs}
                subtitleLang={subtitleLang}
                onSubtitleLangChange={setSubtitleLang}
                subtitleSize={subtitleSize}
                onSubtitleSizeChange={setSubtitleSize}
                theater={theater}
                onToggleTheater={toggleTheater}
                onError={() => addToast("Errore stream — ricarica la pagina")}
                onNotice={addToast}
              />
            )}

            {/* ── Controls bar ───────────────────────── */}
            <div className="player-controls">
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
                    <ChannelLink channelId={info.channel_id} name={info.channel} navigate={navigate} className="channel-avatar">
                      {channelAvatar
                        ? <img src={channelAvatar} alt={info.channel} referrerPolicy="no-referrer" />
                        : (info.channel || "?")[0]}
                    </ChannelLink>
                    <div className="channel-name">
                      <ChannelLink channelId={info.channel_id} name={info.channel} navigate={navigate} />
                    </div>

                    {/* Accanto al nome del canale, come su YouTube: da qui ci si
                        iscrive senza passare dalla pagina del canale. */}
                    <SubscribeButton
                      channelId={info.channel_id}
                      channelName={info.channel}
                      thumbnail={channelAvatar}
                      onNotice={addToast}
                      onChange={onSubsChange}
                    />
                  </div>

                  <div className="video-actions">
                    {info.likes && (
                      <span className="action-btn" style={{ cursor: "default" }}>
                        👍 {formatCompact(info.likes)}
                      </span>
                    )}

                    {/* L'unico comando Chromecast dell'app. Sempre visibile:
                        quando il cast non è disponibile spiega il perché invece
                        di sparire senza dare spiegazioni. */}
                    <CastButton cast={cast} media={castMedia} onNotice={addToast} />

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
              </>
            )}
          </div>

          {/* ── Commenti ─────────────────────────────── */}
          {info && (
            <div className="video-comments">
              <Comments
                videoId={videoId}
                channelId={info.channel_id}
                authStatus={authStatus}
                navigate={navigate}
                onToast={addToast}
              />
            </div>
          )}
        </div>

        {/* ── Related ──────────────────────────────── */}
        <div className="related-sidebar">
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: "var(--text2)" }}>Video correlati</h3>
          {related.map(v => (
            <div
              key={v.id}
              className="related-item"
              onClick={e => {
                if (daLinkCanale(e)) return;   // tocco sul canale: si va al canale
                navigate("video", { videoId: v.id });
              }}
            >
              <div className="related-thumb">
                <img src={v.thumbnail} alt={v.title} loading="lazy" />
                {v.duration && <span className="related-duration">{formatDuration(v.duration)}</span>}
              </div>
              <div className="related-meta">
                <div className="related-title">{v.title}</div>
                <div className="related-channel">
                  <ChannelLink channelId={v.channel_id} name={v.channel} navigate={navigate} />
                </div>
                <div className="related-views">{formatViews(v.views)}</div>
              </div>
            </div>
          ))}

          {/* Sentinella: entrando nel viewport carica il blocco successivo del mix */}
          <div ref={relatedSentinelRef} style={{ height: 1 }} />

          {relatedLoading && (
            <div style={{ padding: "12px 0", textAlign: "center", fontSize: 13, color: "var(--text3)" }}>
              Caricamento…
            </div>
          )}
        </div>
      </div>
      <ToastContainer />
    </div>
  );
}
