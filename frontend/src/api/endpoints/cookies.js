import { apiFetch } from "../core";

export const cookiesEndpoints = {
  uploadCookies: (file) => {
    const fd = new FormData();
    fd.append("file", file);
    return apiFetch("/api/cookies/upload", { method: "POST", body: fd });
  },
  deleteCookies: () => apiFetch("/api/cookies", { method: "DELETE" }),
  cookieBrowsers: () => apiFetch("/api/cookies/browsers"),
  importCookies: (browser) => apiFetch(`/api/cookies/import?browser=${browser}`, { method: "POST" }),
};
