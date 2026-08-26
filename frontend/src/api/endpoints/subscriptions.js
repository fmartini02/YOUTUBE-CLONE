import { apiFetch } from "../core";

export const subscriptionsEndpoints = {
  subscriptions: () => apiFetch("/api/subscriptions"),
  syncSubs: () => apiFetch("/api/subscriptions/sync", { method: "POST" }),
  // Stato del pulsante "Iscriviti": lo dice il server, che ha la copia locale
  // delle iscrizioni (nessuna chiamata a YouTube, nessun consumo di quota).
  subStatus: (id) => apiFetch(`/api/subscriptions/status/${id}`),
  // name/thumbnail servono solo come ripiego se YouTube dice "già iscritto".
  subscribe: (id, { name = "", thumbnail = "" } = {}) => apiFetch(`/api/subscriptions/${id}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, thumbnail }),
  }),
  unsubscribe: (id) => apiFetch(`/api/subscriptions/${id}`, { method: "DELETE" }),
};
