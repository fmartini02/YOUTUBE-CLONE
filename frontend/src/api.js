const BASE = import.meta.env.VITE_API_URL || "";

export async function apiFetch(path, opts = {}) {
  const res = await fetch(BASE + path, opts);
  if (!res.ok) {
    const err = await res.text().catch(() => "Unknown error");
    throw new Error(err);
  }
  return res.json();
}

export const api = {
  search: (q, page = 1) => apiFetch(`/api/search?q=${encodeURIComponent(q)}&page=${page}`),
  trending: () => apiFetch("/api/trending"),
  videoInfo: (id) => apiFetch(`/api/video/${id}`),
  streamUrl: (id, quality = "best") => apiFetch(`/api/stream/${id}?quality=${quality}`),
  downloadUrl: (id, quality = "best") => `${BASE}/api/download/${id}?quality=${quality}`,
  suggestions: (q) => apiFetch(`/api/suggestions?q=${encodeURIComponent(q)}`),
  channelVideos: (id) => apiFetch(`/api/channel/${id}/videos`),
  authStatus: () => apiFetch("/api/auth/status"),
  getAuthUrl: (client_id, client_secret) => apiFetch("/api/auth/url", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id, client_secret }),
  }),
  logout: () => apiFetch("/api/auth/logout", { method: "POST" }),
  subscriptions: () => apiFetch("/api/subscriptions"),
  syncSubs: () => apiFetch("/api/subscriptions/sync", { method: "POST" }),
  subsFeed: () => apiFetch("/api/feed/subscriptions"),
  uploadCookies: (file) => { const fd = new FormData(); fd.append("file", file); return apiFetch("/api/cookies/upload", { method: "POST", body: fd }); },
  deleteCookies: () => apiFetch("/api/cookies", { method: "DELETE" }),
  history: () => apiFetch("/api/history"),
  addHistory: (entry) => apiFetch("/api/history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry) }),
  clearHistory: () => apiFetch("/api/history", { method: "DELETE" }),
  prefs: () => apiFetch("/api/prefs"),
  updatePrefs: (u) => apiFetch("/api/prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(u) }),
};

export function isMobile() { return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent); }
export function isTV() { return /SmartTV|Tizen|WebOS|SMART-TV|HbbTV/i.test(navigator.userAgent); }
export function isElectron() { return typeof window !== "undefined" && !!window.__YTPROXY_ELECTRON__; }
export function getDeviceType() {
  if (isElectron()) return "desktop";
  if (isTV()) return "tv";
  if (isMobile()) return "mobile";
  return "browser";
}

export function formatDuration(secs) {
  if (!secs) return "";
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  if (h) return `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  return `${m}:${String(s).padStart(2,"0")}`;
}
export function formatViews(n) {
  if (!n) return "";
  if (n >= 1e9) return `${(n/1e9).toFixed(1)}B views`;
  if (n >= 1e6) return `${(n/1e6).toFixed(1)}M views`;
  if (n >= 1e3) return `${(n/1e3).toFixed(1)}K views`;
  return `${n} views`;
}
export function formatDate(s) {
  if (!s) return "";
  return new Date(`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`).toLocaleDateString("it-IT", { year:"numeric", month:"short", day:"numeric" });
}
export function timeAgo(ts) {
  if (!ts) return "";
  const diff = (Date.now()/1000) - ts;
  if (diff < 60) return "ora";
  if (diff < 3600) return `${Math.floor(diff/60)}min fa`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h fa`;
  return `${Math.floor(diff/86400)}g fa`;
}
