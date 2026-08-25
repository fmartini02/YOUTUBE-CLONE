import { apiFetch } from "../core";

export const searchEndpoints = {
  search: (q, page = 1) => apiFetch(`/api/search?q=${encodeURIComponent(q)}&page=${page}`),
  suggestions: (q) => apiFetch(`/api/suggestions?q=${encodeURIComponent(q)}`),
};
