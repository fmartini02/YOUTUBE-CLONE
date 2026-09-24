import { useToast } from "../../hooks/useToast";
import { useInfiniteScroll } from "../../hooks/useInfiniteScroll";
import { WATCH_LATER_ID } from "../../api";
import { usePlaylistData } from "./usePlaylistData";
import PlaylistHeader from "./PlaylistHeader";
import PlaylistRow from "./PlaylistRow";

// Perché la lista è vuota: casi diversi, e solo "errore" è un problema.
const EMPTY_MESSAGES = {
  "playlist-non-trovata": ["Playlist non raggiungibile", "YouTube non ha restituito nulla: la playlist potrebbe essere privata o eliminata."],
  "playlist-vuota": ["Playlist vuota", "Non contiene video disponibili (quelli privati o eliminati non si possono guardare)."],
  "coda-vuota": ["Nessun video salvato", "Usa \"Salva\" sotto un video, o il menu ⋮ di una copertina, per guardarlo più tardi."],
  errore: ["Errore nel caricamento", "Il server non ha risposto. Controlla che sia attivo e riprova."],
};

function PlaylistEmpty({ reason }) {
  const [titolo, testo] = EMPTY_MESSAGES[reason] || EMPTY_MESSAGES["playlist-vuota"];
  return (
    <div style={{ textAlign: "center", padding: 60, color: "var(--text2)" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
      <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>{titolo}</div>
      <div style={{ maxWidth: 460, margin: "0 auto", lineHeight: 1.5 }}>{testo}</div>
    </div>
  );
}

/**
 * Pagina di una playlist (/playlist?list=<id>): intestazione e video in
 * ordine, con scroll infinito. Aprire un video lo apre DENTRO la playlist
 * (`listId`), come su YouTube. Con l'id `WL` è la coda locale "Guarda più
 * tardi", l'unica da cui si possono togliere video.
 */
export default function PlaylistPage({ listId, navigate }) {
  const { addToast, ToastContainer } = useToast();
  const data = usePlaylistData(listId, addToast);
  const sentinelRef = useInfiniteScroll({ hasMore: data.hasMore, loading: data.loading || data.loadingMore, onLoadMore: data.loadMore });
  const apri = v => navigate("video", { videoId: v.id, listId });

  if (data.loading) return <div style={{ color: "var(--text2)" }}>Caricamento playlist...</div>;
  return (
    <div className="playlist-page">
      {data.playlist && <PlaylistHeader playlist={data.playlist} caricati={data.videos.length} primo={data.videos[0]} navigate={navigate} />}
      {data.videos.length === 0 ? <PlaylistEmpty reason={data.emptyReason} /> : (
        <div className="history-list">
          {data.videos.map((v, i) => (
            <PlaylistRow key={v.id} v={v} indice={i} onOpen={apri} navigate={navigate}
              onRemove={listId === WATCH_LATER_ID ? data.rimuovi : null} />
          ))}
        </div>
      )}
      <div ref={sentinelRef} style={{ height: 1 }} />
      {data.loadingMore && <div style={{ padding: 12, textAlign: "center", color: "var(--text3)" }}>Caricamento…</div>}
      <ToastContainer />
    </div>
  );
}
