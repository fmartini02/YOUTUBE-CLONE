import { apiFetch } from "../core";

export const prefsEndpoints = {
  prefs: () => apiFetch("/api/prefs"),
  updatePrefs: (u) => apiFetch("/api/prefs", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(u),
  }),
};
