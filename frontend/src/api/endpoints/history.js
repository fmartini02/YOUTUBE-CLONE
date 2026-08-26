import { apiFetch } from "../core";

export const historyEndpoints = {
  history: (limit = 200) => apiFetch(`/api/history?limit=${limit}`),
  removeHistory: (id) => apiFetch(`/api/history/${id}`, { method: "DELETE" }),
  addHistory: (entry) => apiFetch("/api/history", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry),
  }),
  clearHistory: () => apiFetch("/api/history", { method: "DELETE" }),
};
