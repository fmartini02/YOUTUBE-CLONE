import { apiFetch } from "../core";

// `filtri`: { tipo, durata, data, ordina } — solo quelli impostati finiscono
// nella richiesta (valori e significato in server/ytdlp/search_filters.py).
function searchQuery(q, page, filtri) {
  const sp = new URLSearchParams({ q, page: String(page) });
  for (const [k, v] of Object.entries(filtri)) if (v) sp.set(k, v);
  return sp.toString();
}

export const searchEndpoints = {
  search: (q, page = 1, filtri = {}) => apiFetch(`/api/search?${searchQuery(q, page, filtri)}`),
  suggestions: (q) => apiFetch(`/api/suggestions?q=${encodeURIComponent(q)}`),
};
