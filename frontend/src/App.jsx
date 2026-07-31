import { useState, useEffect, useCallback, createContext, useContext } from "react";
import SearchPage from "./pages/SearchPage";
import HomePage from "./pages/HomePage";
import VideoPage from "./pages/VideoPage";
import SettingsPage from "./pages/SettingsPage";
import SubscriptionsPage from "./pages/SubscriptionsPage";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import CastBar from "./components/CastBar";
import { useCast } from "./hooks/useCast.jsx";
import { api } from "./api";
import "./App.css";

// Cast context — disponibile in tutta l'app
export const CastContext = createContext(null);
export function useCastContext() { return useContext(CastContext); }

export default function App() {
  const [page, setPage] = useState("home");
  const [pageParams, setPageParams] = useState({});
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [authStatus, setAuthStatus] = useState(null);
  const castSDK = useCast();

  useEffect(() => {
    const load = () => api.authStatus().then(setAuthStatus).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  const navigate = useCallback((to, params = {}) => {
    setPage(to);
    setPageParams(params);
    window.scrollTo(0, 0);
  }, []);

  const cookieWarning = authStatus?.cookie?.present && authStatus?.cookie?.warning;

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
        <CastBar useCastHook={castSDK} />
      </div>
    </CastContext.Provider>
  );
}
