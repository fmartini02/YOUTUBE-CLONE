import { useState, useEffect } from "react";
import { api } from "../../api";
import { useToast } from "../../hooks/useToast";
import SearchResultCard, { SearchPlaylistCard, SearchSkeleton } from "./SearchResultCard";

// Filtro per tipo di risultato, come "Filtri → Tipo" su YouTube. Sta nell'URL
// (&tipo=playlist): tornando Indietro da una playlist aperta dai risultati si
// ritrovano le playlist, non i video.
const TIPI = [["video", "Video"], ["playlist", "Playlist"]];

function SearchTypeChips({ query, tipo, navigate }) {
  return (
    <div className="filter-chips">
      {TIPI.map(([id, label]) => (
        <button key={id} className={`chip${tipo === id ? " active" : ""}`}
          onClick={() => tipo !== id && navigate("search", id === "video" ? { query } : { query, tipo: id })}>
          {label}
        </button>
      ))}
    </div>
  );
}

function SearchResults({ results, tipo, navigate }) {
  const Card = tipo === "playlist" ? SearchPlaylistCard : SearchResultCard;
  return (
    <div className="search-results">
      {results.map(v => <Card key={v.id} v={v} navigate={navigate} />)}
    </div>
  );
}

function useSearchResults(query, tipoValido, addToast) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!query) return;
    // Cambiando filtro prima della risposta (la ricerca di playlist è più
    // lenta) quella vecchia non deve arrivare dopo e sovrascrivere la nuova.
    let annullato = false;
    setLoading(true);
    api.search(query, 1, tipoValido)
      .then(d => { if (!annullato) setResults(d.results || []); })
      .catch(() => { if (!annullato) addToast("Errore nella ricerca"); })
      .finally(() => { if (!annullato) setLoading(false); });
    return () => { annullato = true; };
  }, [query, tipoValido]); // eslint-disable-line react-hooks/exhaustive-deps
  return { results, loading };
}

export default function SearchPage({ query, tipo = "video", navigate }) {
  const { addToast, ToastContainer } = useToast();
  const tipoValido = tipo === "playlist" ? "playlist" : "video";
  const { results, loading } = useSearchResults(query, tipoValido, addToast);

  return (
    <div>
      <SearchTypeChips query={query} tipo={tipoValido} navigate={navigate} />
      {loading ? <SearchSkeleton query={query} /> : (
        <>
          <p style={{ color: "var(--text2)", marginBottom: 16, fontSize: 14 }}>
            Risultati per "<strong style={{ color: "var(--text)" }}>{query}</strong>" — {results.length} {tipoValido === "playlist" ? "playlist" : "video"}
          </p>
          <SearchResults results={results} tipo={tipoValido} navigate={navigate} />
        </>
      )}
      <ToastContainer />
    </div>
  );
}
