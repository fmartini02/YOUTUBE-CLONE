import { useState, useEffect, useCallback } from "react";
import { api } from "../../api";

const PAGE_SIZE = 30;

function loadInitial(setters) {
  api.subscriptions().then(d => {
    setters.setSubs(d.subscriptions || []);
    setters.setLoading(false);
  }).catch(() => setters.setLoading(false));

  setters.setFeedLoading(true);
  api.subsFeed(PAGE_SIZE, 0).then(d => {
    setters.setFeed(d.results || []);
    setters.setHasMore(!!d.has_more);
    setters.setFeedLoading(false);
  }).catch(() => setters.setFeedLoading(false));
}

/** Stato di /Iscrizioni: elenco canali (OAuth) + feed video (cookie), due fonti indipendenti. */
export function useSubscriptionsData() {
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feed, setFeed] = useState([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    loadInitial({ setSubs, setLoading, setFeed, setFeedLoading, setHasMore });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    api.subsFeed(PAGE_SIZE, feed.length).then(d => {
      setFeed(f => {
        // Dedup per id: senza, chiavi React duplicate romperebbero la griglia.
        const seen = new Set(f.map(v => v.id));
        return [...f, ...(d.results || []).filter(v => !seen.has(v.id))];
      });
      setHasMore(!!d.has_more);
      setLoadingMore(false);
    }).catch(() => setLoadingMore(false));
  }, [feed.length, hasMore, loadingMore]);

  return { subs, setSubs, loading, feed, setFeed, feedLoading, loadingMore, hasMore, loadMore };
}
