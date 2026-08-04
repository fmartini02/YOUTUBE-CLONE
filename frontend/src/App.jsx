import { useState, useEffect, useCallback, createContext, useContext } from "react";
import SearchPage from "./pages/SearchPage";
import HomePage from "./pages/HomePage";
import VideoPage from "./pages/VideoPage";
import SettingsPage from "./pages/SettingsPage";
import SubscriptionsPage from "./pages/SubscriptionsPage";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import CastBar from "./components/CastBar";
import ServerSetup from "./components/ServerSetup";
import { useCast } from "./hooks/useCast.jsx";
import { api, isCapacitor, getServerBase, checkServerReachable } from "./api";
import "./App.css";

// Cast context — disponibile in tutta l'app
export const CastContext = createContext(null);
export function useCastContext() { return useContext(CastContext); }

// Mappa pagina+parametri <-> URL reale, per far funzionare il tasto Indietro
// del browser (History API) invece di uscire dal sito: prima navigate()
// cambiava solo stato React, senza mai toccare l'URL o la cronologia.
function pageToUrl(page, params = {}) {
  switch (page) {
    case "search": return `/search?q=${encodeURIComponent(params.query || "")}`;
    case "video": return `/watch?v=${encodeURIComponent(params.videoId || "")}`;
    case "subscriptions": return "/subscriptions";
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

  useEffect(() => {
    if (!serverReady) return;
    const load = () => api.authStatus().then(setAuthStatus).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [serverReady]);

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

  const cookieWarning = authStatus?.cookie?.present && authStatus?.cookie?.warning;

  if (!serverReady) {
    return <ServerSetup onDone={() => setServerReady(true)} />;
  }

  return (
    <CastContext.Provider value={castSDK}>
      <div className="app" data-sidebar={sidebarOpen}>
        <Header
          navigate={navigate}
          currentQuery={pageParams.query || ""}
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          authStatus={authStatus}
          cast={castSDK}
        />

        {cookieWarning && (
          <div style={{
            position: "fixed", top: "var(--header-height)", left: 0, right: 0, zIndex: 95,
            background: "rgba(255,200,0,0.12)", borderBottom: "1px solid rgba(255,200,0,0.3)",
            padding: "8px 16px", display: "flex", alignItems: "center", gap: 10, fontSize: 13,
          }}>
            <span>⚠️</span>
            <span style={{ color: "#ffc800" }}>I tuoi cookie YouTube hanno più di 2 settimane — aggiornali per il feed personalizzato.</span>
            <button className="action-btn" style={{ marginLeft: "auto", padding: "4px 12px", fontSize: 12 }} onClick={() => navigate("settings")}>
              Aggiorna
            </button>
          </div>
        )}

        <div className="app-body" style={{ marginTop: cookieWarning ? 40 : 0 }}>
          <Sidebar open={sidebarOpen} navigate={navigate} currentPage={page} authStatus={authStatus} />
          <main className="main-content" style={{ paddingBottom: castSDK?.connected ? 72 : 24 }}>
            {page === "home"          && <HomePage navigate={navigate} authStatus={authStatus} />}
            {page === "search"        && <SearchPage query={pageParams.query} navigate={navigate} />}
            {page === "video"         && <VideoPage videoId={pageParams.videoId} navigate={navigate} />}
            {page === "subscriptions" && <SubscriptionsPage navigate={navigate} />}
            {page === "settings"      && <SettingsPage navigate={navigate} />}
          </main>
        </div>

        {/* Barra cast persistente in basso */}
        <CastBar useCastHook={castSDK} navigate={navigate} />
      </div>
    </CastContext.Provider>
  );
}
