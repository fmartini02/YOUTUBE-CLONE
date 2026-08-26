import { useState, useEffect, useCallback } from "react";
import { api } from "../../api";
import { PAGE_SIZE } from "./channelMessages";

async function loadChannel(channelId, cancelledRef, setters) {
  setters.setLoading(true);
  setters.setVideos([]);
  setters.setChannel(null);
  setters.setHasMore(false);
  setters.setEmptyReason(null);
  setters.setDescOpen(false);

  try {
    const d = await api.channelVideos(channelId, PAGE_SIZE, 0);
    if (cancelledRef.current) return;
    setters.setChannel(d.channel || null);
    setters.setVideos(d.results || []);
    setters.setHasMore(!!d.has_more);
    if (!d.results?.length) setters.setEmptyReason(d.reason || "nessun-video");
  } catch {
    if (cancelledRef.current) return;
    setters.setEmptyReason("errore");
  } finally {
    if (!cancelledRef.current) setters.setLoading(false);
  }
}

async function loadMoreVideos(channelId, videosLength, hasMore, loadingMore, setters) {
  if (loadingMore || !hasMore) return;
  setters.setLoadingMore(true);
  try {
    const d = await api.channelVideos(channelId, PAGE_SIZE, videosLength);
    setters.setVideos(prev => {
      // Dedup per id: chiavi React duplicate romperebbero la griglia.
      const seen = new Set(prev.map(v => v.id));
      return [...prev, ...(d.results || []).filter(v => !seen.has(v.id))];
    });
    setters.setHasMore(!!d.has_more);
  } catch {
    setters.setHasMore(false);
  } finally {
    setters.setLoadingMore(false);
  }
}

/** Stato della pagina canale: intestazione + scheda "Video" paginata (vedi /api/channel/<id>/videos). */
export function useChannelData(channelId) {
  const [channel, setChannel] = useState(null);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [emptyReason, setEmptyReason] = useState(null);
  const [descOpen, setDescOpen] = useState(false);
  const setters = { setChannel, setVideos, setLoading, setLoadingMore, setHasMore, setEmptyReason, setDescOpen };

  useEffect(() => {
    const cancelledRef = { current: false };
    loadChannel(channelId, cancelledRef, setters);
    return () => { cancelledRef.current = true; };
  }, [channelId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(
    () => loadMoreVideos(channelId, videos.length, hasMore, loadingMore, setters),
    [channelId, videos.length, hasMore, loadingMore]); // eslint-disable-line react-hooks/exhaustive-deps

  return { channel, videos, loading, loadingMore, hasMore, emptyReason, descOpen, setDescOpen, loadMore };
}
