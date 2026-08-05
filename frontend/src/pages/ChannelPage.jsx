import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import VideoCard from "../components/VideoCard";
import SubscribeButton from "../components/SubscribeButton";
import { useToast } from "../hooks/useToast";
import { useInfiniteScroll } from "../hooks/useInfiniteScroll";

const PAGE_SIZE = 30;

// Perché la lista è vuota: sono due casi diversi, e solo uno è un problema.
const EMPTY_MESSAGES = {
  "canale-non-trovato": {
    title: "Canale non raggiungibile",
    body: "YouTube non ha restituito nulla per questo canale: potrebbe essere stato chiuso o rinominato. Prova a sincronizzare di nuovo le iscrizioni dalle Impostazioni.",
  },
  "nessun-video": {
    title: "Nessun video pubblicato",
    body: "Questo canale non ha video nella scheda Video (potrebbe avere solo Short o dirette).",
  },
  errore: {
    title: "Errore nel caricamento del canale",
    body: "Il server non ha risposto. Controlla che sia attivo e riprova.",
  },
};

function formatSubscribers(n) {
  if (!n) return "";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(".0", "")} Mln di iscritti`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(".0", "")} mila iscritti`;
  return `${n} iscritti`;
}

/**
 * Pagina di un canale: intestazione + scheda "Video" con scroll infinito.
 *
 * `channelName` arriva da chi naviga (la lista iscrizioni ce l'ha già) e serve
 * solo a intestare la pagina durante il caricamento: aprendo l'URL diretto non
 * c'è, e il nome vero arriva comunque dalla risposta del server.
 */
export default function ChannelPage({ channelId, channelName, navigate, onSubsChange }) {
  const [channel, setChannel] = useState(null);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [emptyReason, setEmptyReason] = useState(null);
  const [descOpen, setDescOpen] = useState(false);
  const { addToast, ToastContainer } = useToast();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setVideos([]);
    setChannel(null);
    setHasMore(false);
    setEmptyReason(null);
    setDescOpen(false);

    api.channelVideos(channelId, PAGE_SIZE, 0).then(d => {
      if (cancelled) return;
      setChannel(d.channel || null);
      setVideos(d.results || []);
      setHasMore(!!d.has_more);
      if (!d.results?.length) setEmptyReason(d.reason || "nessun-video");
      setLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setEmptyReason("errore");
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [channelId]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    api.channelVideos(channelId, PAGE_SIZE, videos.length).then(d => {
      setVideos(prev => {
        // Dedup per id: chiavi React duplicate romperebbero la griglia.
        const seen = new Set(prev.map(v => v.id));
        return [...prev, ...(d.results || []).filter(v => !seen.has(v.id))];
      });
      setHasMore(!!d.has_more);
      setLoadingMore(false);
    }).catch(() => {
      setHasMore(false);
      setLoadingMore(false);
    });
  }, [channelId, videos.length, hasMore, loadingMore]);

  const sentinelRef = useInfiniteScroll({
    hasMore,
    loading: loading || loadingMore,
    onLoadMore: loadMore,
  });

  function handleDownload(video) {
    const url = api.downloadUrl(video.id);
    const a = document.createElement("a");
    a.href = url; a.download = `${video.title}.mp4`; a.click();
    addToast(`⬇ Download avviato: ${video.title.slice(0, 40)}...`);
  }

  const nome = channel?.name || channelName || "Canale";
  const descrizione = (channel?.description || "").trim();

  return (
    <div>
      {/* referrerPolicy no-referrer su ogni immagine di yt3: con il Referer di
          localhost quei server rispondono 429 e Chromium blocca la risposta. */}
      {channel?.banner && (
        <img
          src={channel.banner}
          alt=""
          referrerPolicy="no-referrer"
          style={{ width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 12, marginBottom: 16 }}
        />
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        {channel?.avatar ? (
          <img
            src={channel.avatar}
            alt={nome}
            referrerPolicy="no-referrer"
            style={{ width: 80, height: 80, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
          />
        ) : (
          <div style={{ width: 80, height: 80, borderRadius: "50%", background: "var(--bg3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, flexShrink: 0 }}>
            {nome[0]}
          </div>
        )}

        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>
            {nome}
            {channel?.verified && <span style={{ marginLeft: 6, fontSize: 14, color: "var(--text3)" }} title="Canale verificato">✓</span>}
          </h1>
          <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 4 }}>
            {[channel?.handle, formatSubscribers(channel?.subscribers)].filter(Boolean).join(" • ")}
          </div>
          {descrizione && (
            <div
              onClick={() => setDescOpen(o => !o)}
              style={{
                fontSize: 13, color: "var(--text2)", marginTop: 8, maxWidth: 620,
                cursor: "pointer", whiteSpace: "pre-wrap",
                ...(descOpen ? {} : { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }),
              }}
              title={descOpen ? "Comprimi" : "Espandi"}
            >
              {descrizione}
            </div>
          )}
        </div>

        {/* A destra dell'intestazione, come su YouTube. marginLeft:auto lo
            spinge in fondo alla riga; se la riga va a capo (schermo stretto)
            finisce sotto, che è comunque il posto giusto. */}
        <div style={{ marginLeft: "auto" }}>
          <SubscribeButton
            channelId={channelId}
            channelName={nome}
            thumbnail={channel?.avatar}
            onNotice={addToast}
            onChange={onSubsChange}
          />
        </div>
      </div>

      {loading ? (
        <div className="video-grid">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="skeleton-card">
              <div className="skeleton skeleton-thumb" />
              <div className="skeleton skeleton-line" />
              <div className="skeleton skeleton-line short" />
            </div>
          ))}
        </div>
      ) : videos.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text2)" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
          <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
            {(EMPTY_MESSAGES[emptyReason] || EMPTY_MESSAGES["nessun-video"]).title}
          </div>
          <div style={{ maxWidth: 460, margin: "0 auto 18px", lineHeight: 1.5 }}>
            {(EMPTY_MESSAGES[emptyReason] || EMPTY_MESSAGES["nessun-video"]).body}
          </div>
          <button className="chip" onClick={() => navigate("subscriptions")}>
            Torna alle iscrizioni
          </button>
        </div>
      ) : (
        <>
          <div className="video-grid">
            {videos.map(v => (
              <VideoCard
                key={v.id}
                video={v}
                navigate={navigate}
                onDownload={handleDownload}
                avatarUrl={channel?.avatar}
              />
            ))}
          </div>

          {/* Sentinella: quando entra nel viewport scatta il caricamento */}
          <div ref={sentinelRef} style={{ height: 1 }} />

          {loadingMore && (
            <div className="video-grid" style={{ marginTop: 40 }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton-card">
                  <div className="skeleton skeleton-thumb" />
                  <div className="skeleton skeleton-line" />
                  <div className="skeleton skeleton-line short" />
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <ToastContainer />
    </div>
  );
}
