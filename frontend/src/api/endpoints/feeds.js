import { apiFetch } from "../core";

export const feedsEndpoints = {
  homeFeed: (limit = 24, offset = 0) => apiFetch(`/api/feed/home?limit=${limit}&offset=${offset}`),
  related: (id, limit = 20, offset = 0) => apiFetch(`/api/related/${id}?limit=${limit}&offset=${offset}`),
  channelAvatars: (ids) => apiFetch(`/api/channel-avatars?ids=${ids.join(",")}`),
  // Oltre ai video restituisce `channel` (nome, logo, copertina, iscritti):
  // l'intestazione della pagina canale arriva dalla stessa estrazione.
  channelVideos: (id, limit = 30, offset = 0) =>
    apiFetch(`/api/channel/${id}/videos?limit=${limit}&offset=${offset}`),
  subsFeed: (limit = 30, offset = 0) => apiFetch(`/api/feed/subscriptions?limit=${limit}&offset=${offset}`),
};
