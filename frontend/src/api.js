// Nell'app web/Electron il frontend è servito DAL server stesso, quindi
// BASE resta vuoto (stessa origine). Nell'app Android (Capacitor) invece il
// frontend è impacchettato nell'apk ma il server gira sul PC dell'utente:
// serve un indirizzo esplicito, impostato a runtime dalla schermata di
// onboarding (vedi ServerSetup) e salvato in localStorage — non è noto a
// build-time perché l'IP del PC può cambiare da un'installazione all'altra.
const BASE_KEY = "ytproxy_server_base";

export function getServerBase() {
  return localStorage.getItem(BASE_KEY) || import.meta.env.VITE_API_URL || "";
}

export function setServerBase(url) {
  localStorage.setItem(BASE_KEY, url.replace(/\/+$/, ""));
}

export function clearServerBase() {
  localStorage.removeItem(BASE_KEY);
}

/**
 * Indirizzo del server così come lo vede un ALTRO dispositivo della rete.
 *
 * Per il player del browser basta un percorso relativo, ma il Chromecast
 * scarica il video per conto suo: gli serve un URL assoluto e raggiungibile
 * dalla TV. "localhost" non va bene — per il Chromecast significherebbe sé
 * stesso — quindi in quel caso non si può trasmettere e va usato l'IP di rete.
 */
export function getLanBase() {
  const base = getServerBase() || (typeof window !== "undefined" ? window.location.origin : "");
  return base.replace(/\/+$/, "");
}

export function isCastableOrigin() {
  const base = getLanBase();
  return !!base && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(base);
}

/** Prova a raggiungere /api/health su un indirizzo, con timeout breve — usato dall'onboarding per validare l'IP prima di salvarlo. */
export async function checkServerReachable(url, timeoutMs = 4000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url.replace(/\/+$/, "") + "/api/health", { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

export async function apiFetch(path, opts = {}) {
  const res = await fetch(getServerBase() + path, opts);
  if (!res.ok) {
    const err = await res.text().catch(() => "Unknown error");
    throw new Error(err);
  }
  return res.json();
}

export const api = {
  search: (q, page = 1) => apiFetch(`/api/search?q=${encodeURIComponent(q)}&page=${page}`),
  trending: (limit = 24, offset = 0) => apiFetch(`/api/trending?limit=${limit}&offset=${offset}`),
  homeFeed: (limit = 24, offset = 0) => apiFetch(`/api/feed/home?limit=${limit}&offset=${offset}`),
  channelAvatars: (ids) => apiFetch(`/api/channel-avatars?ids=${ids.join(",")}`),
  videoInfo: (id) => apiFetch(`/api/video/${id}`),
  streamUrl: (id, quality = "best") => apiFetch(`/api/stream/${id}?quality=${quality}`),
  watch: (id, quality = "best") => apiFetch(`/api/watch/${id}?quality=${quality}`),
  comments: (id, limit = 30) => apiFetch(`/api/comments/${id}?limit=${limit}`),
  subtitleLanguages: (id) => apiFetch(`/api/subtitles/${id}`),
  subtitleUrl: (id, lang) => `${getServerBase()}/api/subtitles/${id}/${lang}.vtt`,
  downloadUrl: (id, quality = "best") => `${getServerBase()}/api/download/${id}?quality=${quality}`,
  // start: secondo da cui far ripartire il flusso. Il flusso di /api/mux non è
  // cercabile dal browser (niente Range), quindi il seek si fa riaprendo lo
  // stream da un altro punto — vedi VideoPlayer.jsx.
  muxUrl: (id, quality = "best", start = 0) =>
    `${getServerBase()}/api/mux/${id}?quality=${quality}${start > 0 ? `&start=${start.toFixed(2)}` : ""}`,
  // Per il Chromecast: URL assoluto (la TV scarica da sé) e codec compatibili.
  castUrl: (id, quality = "best") => `${getLanBase()}/api/mux/${id}?quality=${quality}&compat=1`,
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
  subsFeed: (limit = 30, offset = 0) => apiFetch(`/api/feed/subscriptions?limit=${limit}&offset=${offset}`),
  uploadCookies: (file) => { const fd = new FormData(); fd.append("file", file); return apiFetch("/api/cookies/upload", { method: "POST", body: fd }); },
  deleteCookies: () => apiFetch("/api/cookies", { method: "DELETE" }),
  cookieBrowsers: () => apiFetch("/api/cookies/browsers"),
  importCookies: (browser) => apiFetch(`/api/cookies/import?browser=${browser}`, { method: "POST" }),
  history: () => apiFetch("/api/history"),
  addHistory: (entry) => apiFetch("/api/history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry) }),
  clearHistory: () => apiFetch("/api/history", { method: "DELETE" }),
  prefs: () => apiFetch("/api/prefs"),
  updatePrefs: (u) => apiFetch("/api/prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(u) }),
};

export function isMobile() { return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent); }
export function isTV() { return /SmartTV|Tizen|WebOS|SMART-TV|HbbTV/i.test(navigator.userAgent); }
export function isElectron() { return typeof window !== "undefined" && !!window.__YTPROXY_ELECTRON__; }
export function isCapacitor() { return typeof window !== "undefined" && !!window.Capacitor?.isNativePlatform?.(); }
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
  if (diff < 604800) return `${Math.floor(diff/86400)}g fa`;
  if (diff < 2629800) return `${Math.floor(diff/604800)}sett fa`;
  if (diff < 31557600) return `${Math.floor(diff/2629800)}mesi fa`;
  return `${Math.floor(diff/31557600)}anni fa`;
}
