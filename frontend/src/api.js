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

/**
 * Base da dare al Chromecast, anche quando il sito è aperto su localhost.
 *
 * Il caso normale è proprio quello: server e browser sullo stesso PC. Prima
 * ci si limitava a rifiutare la trasmissione, così il selettore dei
 * dispositivi non si apriva mai; adesso l'indirizzo di rete lo chiediamo al
 * server, che è l'unico a saperlo davvero (con più schede di rete indovinarlo
 * dal browser non è possibile). Il risultato si chiede una volta sola.
 */
let castBasePromise = null;

export function resolveCastBase() {
  if (isCastableOrigin()) return Promise.resolve(getLanBase());
  if (!castBasePromise) {
    castBasePromise = apiFetch("/api/lan-address")
      .then(d => d.address || "")
      .catch(() => "");
  }
  return castBasePromise;
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

/**
 * apiFetch rilancia il corpo della risposta così com'è, che per FastAPI è
 * {"detail": "..."}: qui serve la sola frase, è quella che finisce nel toast.
 */
export function errorMessage(e, fallback = "") {
  const raw = String(e?.message || e || "");
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.detail) return String(parsed.detail);
  } catch { /* non era JSON: si usa il testo così com'è */ }
  return raw.slice(0, 160) || fallback;
}

export const api = {
  search: (q, page = 1) => apiFetch(`/api/search?q=${encodeURIComponent(q)}&page=${page}`),
  trending: (limit = 24, offset = 0) => apiFetch(`/api/trending?limit=${limit}&offset=${offset}`),
  homeFeed: (limit = 24, offset = 0) => apiFetch(`/api/feed/home?limit=${limit}&offset=${offset}`),
  related: (id, limit = 20, offset = 0) => apiFetch(`/api/related/${id}?limit=${limit}&offset=${offset}`),
  channelAvatars: (ids) => apiFetch(`/api/channel-avatars?ids=${ids.join(",")}`),
  videoInfo: (id) => apiFetch(`/api/video/${id}`),
  streamUrl: (id, quality = "best") => apiFetch(`/api/stream/${id}?quality=${quality}`),
  watch: (id, quality = "best") => apiFetch(`/api/watch/${id}?quality=${quality}`),
  // Commenti paginati: pageToken vuoto = prima pagina; la risposta ne
  // restituisce uno nuovo finché ci sono altri commenti da caricare.
  comments: (id, { limit = 40, sort = "top", pageToken = "", channelId = "" } = {}) =>
    apiFetch(`/api/comments/${id}?limit=${limit}&sort=${sort}` +
      `&page_token=${encodeURIComponent(pageToken)}&channel_id=${encodeURIComponent(channelId || "")}`),
  commentReplies: (id, parentId, pageToken = "") =>
    apiFetch(`/api/comments/${id}/replies?parent_id=${encodeURIComponent(parentId)}` +
      `&page_token=${encodeURIComponent(pageToken)}`),
  postComment: (id, text, parentId = null) => apiFetch(`/api/comments/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, parent_id: parentId }),
  }),
  me: () => apiFetch("/api/auth/me"),
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
  // Oltre ai video restituisce `channel` (nome, logo, copertina, iscritti):
  // l'intestazione della pagina canale arriva dalla stessa estrazione.
  channelVideos: (id, limit = 30, offset = 0) =>
    apiFetch(`/api/channel/${id}/videos?limit=${limit}&offset=${offset}`),
  authStatus: () => apiFetch("/api/auth/status"),
  getAuthUrl: (client_id, client_secret) => apiFetch("/api/auth/url", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id, client_secret }),
  }),
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
  subsFeed: (limit = 30, offset = 0) => apiFetch(`/api/feed/subscriptions?limit=${limit}&offset=${offset}`),
  uploadCookies: (file) => { const fd = new FormData(); fd.append("file", file); return apiFetch("/api/cookies/upload", { method: "POST", body: fd }); },
  deleteCookies: () => apiFetch("/api/cookies", { method: "DELETE" }),
  cookieBrowsers: () => apiFetch("/api/cookies/browsers"),
  importCookies: (browser) => apiFetch(`/api/cookies/import?browser=${browser}`, { method: "POST" }),
  history: (limit = 200) => apiFetch(`/api/history?limit=${limit}`),
  removeHistory: (id) => apiFetch(`/api/history/${id}`, { method: "DELETE" }),
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
// Unità in ordine dalla più lunga: la prima che ci sta dentro almeno una volta
// è quella da usare. Singolare e plurale sono entrambi scritti perché in
// italiano non si ricavano l'uno dall'altro ("1 mese" / "3 mesi").
const ETA_UNITA = [
  [31557600, "anno", "anni"],
  [2629800, "mese", "mesi"],
  [604800, "settimana", "settimane"],
  [86400, "giorno", "giorni"],
  [3600, "ora", "ore"],
  [60, "minuto", "minuti"],
];

export function timeAgo(ts) {
  if (!ts) return "";
  const diff = (Date.now()/1000) - ts;
  if (diff < 60) return "adesso";
  for (const [secondi, singolare, plurale] of ETA_UNITA) {
    const n = Math.floor(diff / secondi);
    if (n >= 1) return `${n} ${n === 1 ? singolare : plurale} fa`;
  }
  return "adesso";
}
