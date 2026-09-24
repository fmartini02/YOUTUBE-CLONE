import { useToast } from "../../hooks/useToast";
import { useInfiniteScroll } from "../../hooks/useInfiniteScroll";
import { useSearchResults } from "./useSearchResults";
import { filtriValidi } from "./filtri";
import SearchFilters from "./SearchFilters";
import VideoResult from "./VideoResult";
import ChannelResult from "./ChannelResult";
import PlaylistResult from "./PlaylistResult";

function SearchSkeleton() {
  return Array.from({ length: 6 }).map((_, i) => (
    <div key={i} style={{ display: "flex", gap: 16, marginBottom: 12 }}>
      <div className="skeleton" style={{ width: 240, height: 135, borderRadius: 10, flexShrink: 0 }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="skeleton skeleton-line" />
        <div className="skeleton skeleton-line short" />
      </div>
    </div>
  ));
}

// Senza filtro sul tipo la ricerca mescola video, canali e playlist come su
// YouTube: ogni voce ha il suo `kind` e la sua card.
function SearchResult({ r, navigate, onNotice }) {
  if (r.kind === "channel") return <ChannelResult c={r} navigate={navigate} onNotice={onNotice} />;
  if (r.kind === "playlist") return <PlaylistResult p={r} navigate={navigate} />;
  return <VideoResult v={r} navigate={navigate} />;
}

function ResultsList({ query, filtri, ricerca, navigate, onNotice, sentinelRef }) {
  if (ricerca.loading) return <SearchSkeleton />;
  if (!ricerca.results.length) {
    return (
      <p className="search-empty">
        Nessun risultato per "{query}"{Object.keys(filtri).length ? " con questi filtri: prova a toglierne qualcuno." : "."}
      </p>
    );
  }
  return (
    <div className="search-results">
      {ricerca.results.map(r => <SearchResult key={`${r.kind}:${r.id}`} r={r} navigate={navigate} onNotice={onNotice} />)}
      <div ref={sentinelRef} style={{ height: 1 }} />
      {ricerca.loadingMore && <SearchSkeleton />}
    </div>
  );
}

/**
 * Pagina dei risultati. Query e filtri arrivano da `params`, cioè dall'URL
 * (/search?q=…&tipo=…, vedi App/routing.js): cambiare un filtro è una
 * navigazione verso la stessa pagina con parametri diversi, non uno stato
 * interno — così la ricarica e il link condiviso li conservano.
 */
export default function SearchPage({ params, navigate }) {
  const query = params.query;
  const filtri = filtriValidi(params);
  const { addToast, ToastContainer } = useToast();
  const ricerca = useSearchResults(query, filtri, () => addToast("Errore nella ricerca"));
  const sentinelRef = useInfiniteScroll({
    hasMore: ricerca.hasMore, loading: ricerca.loading || ricerca.loadingMore, onLoadMore: ricerca.loadMore,
  });

  return (
    <div>
      <p style={{ color: "var(--text2)", marginBottom: 12, fontSize: 14 }}>
        Risultati per "<strong style={{ color: "var(--text)" }}>{query}</strong>"
      </p>
      <SearchFilters filtri={filtri} onChange={f => navigate("search", { query, ...f })} />
      <ResultsList query={query} filtri={filtri} ricerca={ricerca} navigate={navigate} onNotice={addToast} sentinelRef={sentinelRef} />
      <ToastContainer />
    </div>
  );
}
