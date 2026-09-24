// Mappa pagina+parametri <-> URL reale, per far funzionare il tasto Indietro
// del browser (History API) invece di uscire dal sito: prima navigate()
// cambiava solo stato React, senza mai toccare l'URL o la cronologia.

export function pageToUrl(page, params = {}) {
  switch (page) {
    case "search": return `/search?q=${encodeURIComponent(params.query || "")}${params.tipo === "playlist" ? "&tipo=playlist" : ""}`;
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
  if (path === "/search") return { page: "search", params: soloDefiniti({ query: sp.get("q") || "", tipo: sp.get("tipo") }) };
  if (path === "/playlist") return { page: "playlist", params: { listId: sp.get("list") || "" } };
  if (path === "/subscriptions") return { page: "subscriptions", params: {} };
  // channelName non sta nell'URL: è solo un'anteprima del titolo, il nome vero
  // lo restituisce il server insieme ai video.
  if (path === "/channel") return { page: "channel", params: { channelId: sp.get("id") || "" } };
  if (path === "/settings") return { page: "settings", params: {} };
  if (path === "/history") return { page: "history", params: {} };
  return { page: "home", params: {} };
}
