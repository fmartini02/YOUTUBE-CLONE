import { apiFetch } from "../core";

export const searchEndpoints = {
  // tipo: "video" (predefinito) o "playlist".
  search: (q, page = 1, tipo = "video") =>
    apiFetch(`/api/search?q=${encodeURIComponent(q)}&page=${page}${tipo !== "video" ? `&tipo=${tipo}` : ""}`),
  suggestions: (q) => apiFetch(`/api/suggestions?q=${encodeURIComponent(q)}`),
};
