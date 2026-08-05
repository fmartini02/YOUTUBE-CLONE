import { useState, useEffect, useCallback, createContext, useContext } from "react";
import SearchPage from "./pages/SearchPage";
import HomePage from "./pages/HomePage";
import VideoPage from "./pages/VideoPage";
import SettingsPage from "./pages/SettingsPage";
import SubscriptionsPage from "./pages/SubscriptionsPage";
import ChannelPage from "./pages/ChannelPage";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import ServerSetup from "./components/ServerSetup";
import { useCast } from "./hooks/useCast.jsx";
import { api, isCapacitor, getServerBase, checkServerReachable } from "./api";
import "./App.css";

// Cast context — l'SDK Chromecast si inizializza una volta sola qui e viene
// consumato dall'unico bottone Cast (pagina video) e dalla diagnostica nelle
// impostazioni.
export const CastContext = createContext(null);
export function useCastContext() { return useContext(CastContext); }

// Avviso cookie: quale problema l'utente ha già scelto di ignorare.
const COOKIE_BANNER_KEY = "ytproxy_cookie_banner_off";

const COOKIE_WARNING_TEXT = {
  stale: "I tuoi cookie YouTube hanno più di 2 settimane — aggiornali per il feed personalizzato.",
  // Caso diverso e più insidioso: il file c'è ma per YouTube sei anonimo,
  // quindi riesportarlo dallo stesso browser non cambierebbe niente.
  "not-logged-in": "I cookie caricati non contengono una sessione YouTube: apri youtube.com nel browser (non solo google.com), poi reimportali.",
};

// Mappa pagina+parametri <-> URL reale, per far funzionare il tasto Indietro
// del browser (History API) invece di uscire dal sito: prima navigate()
// cambiava solo stato React, senza mai toccare l'URL o la cronologia.
function pageToUrl(page, params = {}) {
  switch (page) {
    case "search": return `/search?q=${encodeURIComponent(params.query || "")}`;
    case "video": return `/watch?v=${encodeURIComponent(params.videoId || "")}`;
    case "subscriptions": return "/subscriptions";
    case "channel": return `/channel?id=${encodeURIComponent(params.channelId || "")}`;
    case "settings": return "/settings";
    default: return "/";
  }
}

function urlToPage() {
  const path = window.location.pathname;
  const sp = new URLSearchParams(window.location.search);
  if (path === "/watch") return { page: "video", params: { videoId: sp.get("v") || "" } };
  if (path === "/search") return { page: "search", params: { query: sp.get("q") || "" } };
  if (path === "/subscriptions") return { page: "subscriptions", params: {} };
  // channelName non sta nell'URL: è solo un'anteprima del titolo, il nome vero
  // lo restituisce il server insieme ai video.
  if (path === "/channel") return { page: "channel", params: { channelId: sp.get("id") || "" } };
  if (path === "/settings") return { page: "settings", params: {} };
  return { page: "home", params: {} };
}

export default function App() {
  const [page, setPage] = useState(() => urlToPage().page);
  const [pageParams, setPageParams] = useState(() => urlToPage().params);
  // Come YouTube vero: di default la sidebar è la barra stretta (icona sopra
  // etichetta), non quella larga — si espande solo cliccando l'hamburger.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [authStatus, setAuthStatus] = useState(null);
  const [dismissedCookieReason, setDismissedCookieReason] = useState(
    () => localStorage.getItem(COOKIE_BANNER_KEY) || "",
  );
  // Sul web/Electron il frontend è servito dallo stesso server (nessun setup
  // necessario). Nell'app Android il server va indicato esplicitamente la
  // prima volta (o quando quello salvato non risponde più, es. IP cambiato).
  const [serverReady, setServerReady] = useState(!isCapacitor());
  const castSDK = useCast();

  useEffect(() => {
    if (!isCapacitor()) return;
    const base = getServerBase();
    if (!base) { setServerReady(false); return; }
    checkServerReachable(base).then(setServerReady);
  }, []);

  // Esposta anche alle pagine (vedi onSubsChange): iscriversi o disiscriversi
  // cambia il contatore della sidebar, e aspettare il prossimo giro del
  // timer per vederlo aggiornato sembrerebbe un pulsante che non ha funzionato.
  const loadAuthStatus = useCallback(
    () => api.authStatus().then(setAuthStatus).catch(() => {}),
    [],
  );

  useEffect(() => {
    if (!serverReady) return;
    loadAuthStatus();
    const t = setInterval(loadAuthStatus, 60000);
    return () => clearInterval(t);
  }, [serverReady, loadAuthStatus]);

  // Al primo avvio la pagina corrente non ha ancora una entry nella
  // cronologia con lo state giusto: la registriamo subito, così anche il
  // primissimo "Indietro" ha di che tornare.
  useEffect(() => {
    window.history.replaceState({ page, params: pageParams }, "", pageToUrl(page, pageParams));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onPopState(e) {
      const { page: p, params } = e.state || urlToPage();
      setPage(p);
      setPageParams(params);
      window.scrollTo(0, 0);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((to, params = {}) => {
    setPage(to);
    setPageParams(params);
    window.scrollTo(0, 0);
    window.history.pushState({ page: to, params }, "", pageToUrl(to, params));
  }, []);

  // Avviso cookie: si può chiudere, ma la chiusura vale per QUEL problema.
  // Se il motivo cambia (i cookie erano solo vecchi e ora manca la sessione
  // YouTube) l'avviso ricompare, perché è un'altra cosa da sistemare.
  const cookieReason = authStatus?.cookie?.present ? authStatus.cookie.reason : null;
  const cookieWarning = !!cookieReason && dismissedCookieReason !== cookieReason;

  if (!serverReady) {
    return <ServerSetup onDone={() => setServerReady(true)} />;
  }

  return (
    <CastContext.Provider value={castSDK}>
      <div className="app" data-sidebar={sidebarOpen} data-cookie-banner={cookieWarning}>
        <Header
          navigate={navigate}
          currentQuery={pageParams.query || ""}
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          authStatus={authStatus}
        />

        {cookieWarning && (
          <div className="cookie-banner">
            <span aria-hidden="true">⚠️</span>
            <span className="cookie-banner-text">
              {COOKIE_WARNING_TEXT[cookieReason] || COOKIE_WARNING_TEXT.stale}
            </span>
            <button className="action-btn cookie-banner-btn" onClick={() => navigate("settings")}>
              Aggiorna
            </button>
            <button
              className="cookie-banner-close"
              onClick={() => {
                localStorage.setItem(COOKIE_BANNER_KEY, cookieReason);
                setDismissedCookieReason(cookieReason);
              }}
              title="Nascondi questo avviso"
              aria-label="Nascondi questo avviso"
            >
              ✕
            </button>
          </div>
        )}

        <div className="app-body">
          <Sidebar open={sidebarOpen} navigate={navigate} currentPage={page} authStatus={authStatus} />
          <main className="main-content" style={{ paddingBottom: 24 }}>
            {page === "home"          && <HomePage navigate={navigate} authStatus={authStatus} />}
            {page === "search"        && <SearchPage query={pageParams.query} navigate={navigate} />}
            {page === "video"         && <VideoPage videoId={pageParams.videoId} navigate={navigate} authStatus={authStatus} onSubsChange={loadAuthStatus} />}
            {page === "subscriptions" && <SubscriptionsPage navigate={navigate} onSubsChange={loadAuthStatus} />}
            {page === "channel"       && <ChannelPage channelId={pageParams.channelId} channelName={pageParams.channelName} navigate={navigate} onSubsChange={loadAuthStatus} />}
            {page === "settings"      && <SettingsPage navigate={navigate} />}
          </main>
        </div>
      </div>
    </CastContext.Provider>
  );
}
