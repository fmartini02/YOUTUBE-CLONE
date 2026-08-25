import { useState, useRef, useEffect, useCallback } from "react";
import { api } from "../../api";
import { useInfiniteScroll } from "../../hooks/useInfiniteScroll";

// Quanti correlati per richiesta: il mix di YouTube arriva a blocchi di ~25,
// chiederne 20 alla volta tiene ogni richiesta a una sola continuazione.
const RELATED_PAGE_SIZE = 20;

async function loadMoreImpl(videoId, pageRef, loading, hasMore, setters) {
  if (loading || !hasMore) return;
  setters.setLoading(true);
  try {
    const next = pageRef.current + 1;
    const d = await api.related(videoId, RELATED_PAGE_SIZE, next * RELATED_PAGE_SIZE);
    pageRef.current = next;
    setters.setRelated(prev => {
      // Il mix ripropone periodicamente gli stessi video (incluso quello in
      // riproduzione): senza dedup si avrebbero chiavi React duplicate.
      const seen = new Set([videoId, ...prev.map(v => v.id)]);
      return [...prev, ...(d.results || []).filter(v => !seen.has(v.id))];
    });
    setters.setHasMore(!!d.has_more);
  } catch {
    setters.setHasMore(false);
  } finally {
    setters.setLoading(false);
  }
}

/** Correlati: il "Mix" che YouTube costruisce a partire da questo video. */
export function useRelatedVideos(videoId) {
  const [related, setRelated] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const pageRef = useRef(0);
  const setters = { setRelated, setHasMore, setLoading };

  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    setRelated([]);
    setHasMore(false);
    pageRef.current = 0;
    api.related(videoId, RELATED_PAGE_SIZE, 0).then(d => {
      if (cancelled) return;
      setRelated((d.results || []).filter(v => v.id !== videoId));
      setHasMore(!!d.has_more);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [videoId]);

  const loadMore = useCallback(
    () => loadMoreImpl(videoId, pageRef, loading, hasMore, setters),
    [videoId, loading, hasMore]); // eslint-disable-line react-hooks/exhaustive-deps
  const sentinelRef = useInfiniteScroll({ hasMore, loading, onLoadMore: loadMore });

  return { related, loading, sentinelRef };
}
