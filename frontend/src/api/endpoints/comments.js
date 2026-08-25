import { apiFetch } from "../core";

export const commentsEndpoints = {
  // Commenti paginati: pageToken vuoto = prima pagina; la risposta ne
  // restituisce uno nuovo finché ci sono altri commenti da caricare.
  comments: (id, { limit = 40, sort = "top", pageToken = "", channelId = "" } = {}) =>
    apiFetch(`/api/comments/${id}?limit=${limit}&sort=${sort}` +
      `&page_token=${encodeURIComponent(pageToken)}&channel_id=${encodeURIComponent(channelId || "")}`),
  commentReplies: (id, parentId, pageToken = "") =>
    apiFetch(`/api/comments/${id}/replies?parent_id=${encodeURIComponent(parentId)}` +
      `&page_token=${encodeURIComponent(pageToken)}`),
  postComment: (id, text, parentId = null) => apiFetch(`/api/comments/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, parent_id: parentId }),
  }),
};
