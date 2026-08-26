// Mappa pagina+parametri <-> URL reale, per far funzionare il tasto Indietro
// del browser (History API) invece di uscire dal sito: prima navigate()
// cambiava solo stato React, senza mai toccare l'URL o la cronologia.

export function pageToUrl(page, params = {}) {
  switch (page) {
    case "search": return `/search?q=${encodeURIComponent(params.query || "")}`;
    case "video": return `/watch?v=${encodeURIComponent(params.videoId || "")}`;
    case "subscriptions": return "/subscriptions";
    case "channel": return `/channel?id=${encodeURIComponent(params.channelId || "")}`;
    case "settings": return "/settings";
    case "history": return "/history";
    default: return "/";
  }
}

export function urlToPage() {
  const path = window.location.pathname;
  const sp = new URLSearchParams(window.location.search);
  if (path === "/watch") return { page: "video", params: { videoId: sp.get("v") || "" } };
  if (path === "/search") return { page: "search", params: { query: sp.get("q") || "" } };
  if (path === "/subscriptions") return { page: "subscriptions", params: {} };
  // channelName non sta nell'URL: è solo un'anteprima del titolo, il nome vero
  // lo restituisce il server insieme ai video.
  if (path === "/channel") return { page: "channel", params: { channelId: sp.get("id") || "" } };
  if (path === "/settings") return { page: "settings", params: {} };
  if (path === "/history") return { page: "history", params: {} };
  return { page: "home", params: {} };
}
