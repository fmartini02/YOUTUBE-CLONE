import { apiFetch } from "../core";

// Id della coda locale "Guarda più tardi": lo stesso di YouTube, così
// /watch?v=…&list=WL e /playlist?list=WL funzionano come lì. Il server risponde
// con la coda salvata in data/watch_later.json (vedi server/auth/watch_later.py).
export const WATCH_LATER_ID = "WL";

export const playlistsEndpoints = {
  // Oltre ai video restituisce `playlist` (titolo, autore, numero di video).
  playlist: (id, limit = 50, offset = 0) =>
    apiFetch(`/api/playlist/${encodeURIComponent(id)}?limit=${limit}&offset=${offset}`),
  channelPlaylists: (id) => apiFetch(`/api/channel/${id}/playlists`),
  watchLaterStatus: (id) => apiFetch(`/api/watch-later/${id}`),
  // `added` false = c'era già. Scrittura: passa dalla guardia sull'Origin.
  addWatchLater: (video) => apiFetch("/api/watch-later", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: video.id, title: video.title || video.id, channel: video.channel || null,
      channel_id: video.channel_id || null, duration: video.duration || null, thumbnail: video.thumbnail || null,
    }),
  }),
  removeWatchLater: (id) => apiFetch(`/api/watch-later/${id}`, { method: "DELETE" }),
};
