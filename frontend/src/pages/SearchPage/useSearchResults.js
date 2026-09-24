import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../../api";

// Chiave di una voce: video, canali e playlist hanno id di forme diverse, ma
// un id da solo non dice di che tipo è — meglio non contarci.
const chiave = r => `${r.kind}:${r.id}`;

async function loadFirst(query, filtri, stato, setters) {
  setters.setLoading(true);
  setters.setResults([]);
  setters.setHasMore(false);
  try {
    const d = await api.search(query, 1, filtri);
    if (stato.annullato) return;
    stato.refs.pagina.current = 1;
    setters.setResults(d.results || []);
    setters.setHasMore(!!d.has_more);
  } catch {
    if (!stato.annullato) setters.onError();
  } finally {
    if (!stato.annullato) setters.setLoading(false);
  }
}

async function loadMoreImpl(query, filtri, refs, setters) {
  // Se nel frattempo è cambiata la ricerca (altri filtri, altra query) questa
  // pagina appartiene a una lista che non c'è più: la si butta.
  const gen = refs.gen.current;
  setters.setLoadingMore(true);
  try {
    const next = refs.pagina.current + 1;
    const d = await api.search(query, next, filtri);
    if (gen !== refs.gen.current) return;
    refs.pagina.current = next;
    // Dedup: le continuazioni di YouTube ripetono qualche voce fra una
    // pagina e l'altra, e chiavi React doppie romperebbero la lista.
    setters.setResults(prev => {
      const visti = new Set(prev.map(chiave));
      return [...prev, ...(d.results || []).filter(r => !visti.has(chiave(r)))];
    });
    setters.setHasMore(!!d.has_more);
  } catch {
    setters.setHasMore(false);
  } finally {
    setters.setLoadingMore(false);
  }
}

/**
 * Risultati di una ricerca con filtri, a pagine (scroll infinito).
 *
 * Si riparte da capo quando cambiano la query o i filtri: la dipendenza è
 * `filtriKey` (stringa) e non l'oggetto `filtri`, che è nuovo ad ogni render.
 */
export function useSearchResults(query, filtri, onError) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const refs = { pagina: useRef(1), gen: useRef(0) };
  const setters = { setResults, setLoading, setLoadingMore, setHasMore, onError };
  const filtriKey = JSON.stringify(filtri);

  useEffect(() => {
    if (!query) return;
    refs.gen.current += 1;
    const stato = { annullato: false, refs };
    loadFirst(query, filtri, stato, setters);
    return () => { stato.annullato = true; };
  }, [query, filtriKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore) loadMoreImpl(query, filtri, refs, setters);
  }, [query, filtriKey, hasMore, loadingMore]); // eslint-disable-line react-hooks/exhaustive-deps

  return { results, loading, loadingMore, hasMore, loadMore };
}
