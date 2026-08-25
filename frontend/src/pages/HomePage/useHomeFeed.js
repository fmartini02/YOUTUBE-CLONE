import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../../api";
import { PAGE_SIZE } from "./homeMessages";

function fetchPage(kind, page, category) {
  if (kind === "search") return api.search(category, page);
  return api.homeFeed(PAGE_SIZE, (page - 1) * PAGE_SIZE);
}

async function loadFirstPage(category, pagerRef, cancelledRef, setters) {
  setters.setLoading(true);
  setters.setVideos([]);
  setters.setHasMore(false);
  setters.setEmptyReason(null);

  // "Tutti" = home vera e propria: solo le raccomandazioni reali di YouTube
  // (servono i cookie di una sessione loggata). Niente ripiego sui trending:
  // mostrare le tendenze italiane al posto della propria home è peggio di
  // una home vuota, perché sembra che funzioni tutto mentre la sessione è
  // da rifare.
  const kind = category === "Tutti" ? "home" : "search";
  try {
    const data = await fetchPage(kind, 1, category);
    if (cancelledRef.current) return;
    pagerRef.current = { kind, page: 1 };
    setters.setFeedSource(kind === "home" ? "youtube-home" : null);
    setters.setVideos(data.results || []);
    setters.setHasMore(!!data.has_more);
    if (kind === "home" && !data.results?.length) setters.setEmptyReason(data.reason || "feed-vuoto");
  } catch {
    if (cancelledRef.current) return;
    setters.setFeedSource(kind === "home" ? "youtube-home" : null);
    setters.setEmptyReason(kind === "home" ? "errore" : null);
  } finally {
    if (!cancelledRef.current) setters.setLoading(false);
  }
}

async function loadMoreImpl(pagerRef, category, hasMore, loadingMore, setters) {
  if (loadingMore || !hasMore) return;
  setters.setLoadingMore(true);
  try {
    const { kind, page } = pagerRef.current;
    const next = page + 1;
    const data = await fetchPage(kind, next, category);
    pagerRef.current = { kind, page: next };
    setters.setVideos(prev => {
      // Dedup per id: gli elenchi di YouTube possono ripetere lo stesso video
      // tra una pagina e l'altra, e chiavi React duplicate romperebbero il
      // rendering della griglia.
      const seen = new Set(prev.map(v => v.id));
      return [...prev, ...(data.results || []).filter(v => !seen.has(v.id))];
    });
    setters.setHasMore(!!data.has_more);
  } catch {
    setters.setHasMore(false);
  } finally {
    setters.setLoadingMore(false);
  }
}

export function useHomeFeed(category) {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [feedSource, setFeedSource] = useState(null); // null | "youtube-home"
  const [emptyReason, setEmptyReason] = useState(null); // perché la home è vuota
  // Da quale elenco stiamo paginando, per proseguire sullo STESSO elenco
  // invece di ricominciare da capo.
  const pagerRef = useRef({ kind: "home", page: 1 });
  const setters = { setVideos, setLoading, setLoadingMore, setHasMore, setFeedSource, setEmptyReason };

  useEffect(() => {
    const cancelledRef = { current: false };
    loadFirstPage(category, pagerRef, cancelledRef, setters);
    return () => { cancelledRef.current = true; };
  }, [category]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(
    () => loadMoreImpl(pagerRef, category, hasMore, loadingMore, setters),
    [category, hasMore, loadingMore]); // eslint-disable-line react-hooks/exhaustive-deps

  return { videos, loading, loadingMore, hasMore, feedSource, emptyReason, loadMore };
}
