import { useState, useEffect, useCallback } from "react";
import { api } from "../../api";

// Una pagina di YouTube ne porta 100: 50 alla volta tengono ogni richiesta a
// metà continuazione (vedi PLAYLIST_CHUNK in server/auth/config.py).
export const PLAYLIST_PAGE_SIZE = 50;

async function loadPlaylist(listId, cancelledRef, setters) {
  setters.setLoading(true);
  setters.setVideos([]);
  setters.setPlaylist(null);
  setters.setHasMore(false);
  setters.setEmptyReason(null);
  try {
    const d = await api.playlist(listId, PLAYLIST_PAGE_SIZE, 0);
    if (cancelledRef.current) return;
    setters.setPlaylist(d.playlist || null);
    setters.setVideos(d.results || []);
    setters.setHasMore(!!d.has_more);
    if (!d.results?.length) setters.setEmptyReason(d.reason || "playlist-vuota");
  } catch {
    if (!cancelledRef.current) setters.setEmptyReason("errore");
  } finally {
    if (!cancelledRef.current) setters.setLoading(false);
  }
}

// L'offset è quanti video si hanno già: vale anche per "Guarda più tardi"
// dopo aver tolto una voce, perché la stessa voce sparisce anche dal server.
async function loadMorePlaylist(listId, videosLength, state, setters) {
  if (state.loadingMore || !state.hasMore) return;
  setters.setLoadingMore(true);
  try {
    const d = await api.playlist(listId, PLAYLIST_PAGE_SIZE, videosLength);
    setters.setVideos(prev => {
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

// Solo per "Guarda più tardi": ottimistico come la cronologia (historyActions.js),
// se il server rifiuta la lista si rilegge invece di far finta di niente.
async function rimuoviDallaCoda(id, setters, addToast, ricarica) {
  setters.setVideos(v => v.filter(x => x.id !== id));
  setters.setPlaylist(p => (p ? { ...p, count: Math.max(0, (p.count || 1) - 1) } : p));
  try {
    await api.removeWatchLater(id);
  } catch {
    addToast("Non sono riuscito a togliere il video");
    ricarica();
  }
}

/** Stato della pagina playlist: intestazione + video a pagine (vedi /api/playlist/<id>). */
export function usePlaylistData(listId, addToast) {
  const [playlist, setPlaylist] = useState(null);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [emptyReason, setEmptyReason] = useState(null);
  const [giro, setGiro] = useState(0);
  const setters = { setPlaylist, setVideos, setLoading, setLoadingMore, setHasMore, setEmptyReason };

  useEffect(() => {
    const cancelledRef = { current: false };
    loadPlaylist(listId, cancelledRef, setters);
    return () => { cancelledRef.current = true; };
  }, [listId, giro]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(
    () => loadMorePlaylist(listId, videos.length, { hasMore, loadingMore }, setters),
    [listId, videos.length, hasMore, loadingMore]); // eslint-disable-line react-hooks/exhaustive-deps
  const rimuovi = id => rimuoviDallaCoda(id, setters, addToast, () => setGiro(g => g + 1));

  return { playlist, videos, loading, loadingMore, hasMore, emptyReason, loadMore, rimuovi };
}
