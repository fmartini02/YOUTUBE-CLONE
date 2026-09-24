import { apiFetch } from "../core";

export const historyEndpoints = {
  history: (limit = 200) => apiFetch(`/api/history?limit=${limit}`),
  removeHistory: (id) => apiFetch(`/api/history/${id}`, { method: "DELETE" }),
  addHistory: (entry) => apiFetch("/api/history", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry),
  }),
  clearHistory: () => apiFetch("/api/history", { method: "DELETE" }),
  // Fin dove è stato visto un video (vedi server/auth/watch_progress.py).
  // `keepalive`: il salvataggio all'uscita (pagina chiusa, app in background)
  // deve arrivare anche se la pagina intanto se ne va.
  saveProgress: (id, body) => apiFetch(`/api/history/${id}/progress`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true,
  }),
  resumePoint: (id) => apiFetch(`/api/history/${id}/progress`),
  progressMap: () => apiFetch("/api/history/progress"),
};
