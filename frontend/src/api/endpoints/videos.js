import { apiFetch } from "../core";

export const videosEndpoints = {
  // Rating corrente dell'account per il video ("like" | "dislike" | "none").
  // 1 unità di quota lato Data API — vedi server/routers/videos.py.
  videoRating: (id) => apiFetch(`/api/videos/${id}/rating`),
  // Mette/toglie "mi piace" (50 unità di quota). rating: "like" | "none".
  rateVideo: (id, rating) => apiFetch(`/api/videos/${id}/rate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rating }),
  }),
};
