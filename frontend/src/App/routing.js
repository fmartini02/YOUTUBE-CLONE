// Mappa pagina+parametri <-> URL reale, per far funzionare il tasto Indietro
// del browser (History API) invece di uscire dal sito: prima navigate()
// cambiava solo stato React, senza mai toccare l'URL o la cronologia.

// Filtri della ricerca (vedi pages/SearchPage/filtri.js): stanno nell'URL con
// lo stesso nome del parametro di /api/search, così ricaricare la pagina o
// condividere il link li conserva. Nell'URL finiscono solo quelli impostati.
export const SEARCH_FILTER_KEYS = ["tipo", "durata", "data", "ordina"];

function searchToUrl(params) {
  const sp = new URLSearchParams({ q: params.query || "" });
  for (const k of SEARCH_FILTER_KEYS) if (params[k]) sp.set(k, params[k]);
  return `/search?${sp}`;
}

function searchFromUrl(sp) {
  const params = { query: sp.get("q") || "" };
  for (const k of SEARCH_FILTER_KEYS) if (sp.get(k)) params[k] = sp.get(k);
  return params;
}

export function pageToUrl(page, params = {}) {
  switch (page) {
    case "search": return searchToUrl(params);
    // `listId`: il video si sta guardando dentro una playlist (pannello a
    // destra, avanzamento automatico) — come il `&list=` di YouTube.
    case "video": return `/watch?v=${encodeURIComponent(params.videoId || "")}${params.listId ? `&list=${encodeURIComponent(params.listId)}` : ""}`;
    case "playlist": return `/playlist?list=${encodeURIComponent(params.listId || "")}`;
    case "subscriptions": return "/subscriptions";
    case "channel": return `/channel?id=${encodeURIComponent(params.channelId || "")}`;
    case "settings": return "/settings";
    case "history": return "/history";
    default: return "/";
  }
}

// I parametri facoltativi assenti dall'URL non diventano chiavi a `null`: i
// parametri finiscono in history.state e vengono confrontati come URL (vedi
// navHistory.js), ma restano più leggibili senza chiavi vuote.
function soloDefiniti(params) {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v != null));
}

export function urlToPage() {
  const path = window.location.pathname;
  const sp = new URLSearchParams(window.location.search);
  if (path === "/watch") return { page: "video", params: soloDefiniti({ videoId: sp.get("v") || "", listId: sp.get("list") }) };
  if (path === "/search") return { page: "search", params: searchFromUrl(sp) };
  if (path === "/playlist") return { page: "playlist", params: { listId: sp.get("list") || "" } };
  if (path === "/subscriptions") return { page: "subscriptions", params: {} };
  // channelName non sta nell'URL: è solo un'anteprima del titolo, il nome vero
  // lo restituisce il server insieme ai video.
  if (path === "/channel") return { page: "channel", params: { channelId: sp.get("id") || "" } };
  if (path === "/settings") return { page: "settings", params: {} };
  if (path === "/history") return { page: "history", params: {} };
  return { page: "home", params: {} };
}
