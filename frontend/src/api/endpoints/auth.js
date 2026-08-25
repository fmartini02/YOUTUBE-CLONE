import { apiFetch } from "../core";

export const authEndpoints = {
  me: () => apiFetch("/api/auth/me"),
  authStatus: () => apiFetch("/api/auth/status"),
  // Device flow: niente redirect, quindi funziona anche col server su un'altra
  // macchina della rete (vedi /api/auth/device/start).
  deviceStart: (client_id, client_secret) => apiFetch("/api/auth/device/start", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id, client_secret }),
  }),
  devicePoll: (device_code) => apiFetch("/api/auth/device/poll", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_code }),
  }),
  logout: () => apiFetch("/api/auth/logout", { method: "POST" }),
};
