import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import CookieWarningBanner from "./CookieWarningBanner";
import AppRoutes from "./AppRoutes";

export default function AppLayout({ nav, cookie, sidebarOpen, setSidebarOpen }) {
  return (
    <div className="app" data-sidebar={sidebarOpen} data-cookie-banner={cookie.cookieWarning}>
      <Header
        navigate={nav.navigate}
        currentQuery={nav.pageParams.query || ""}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        authStatus={nav.authStatus}
      />

      {cookie.cookieWarning && (
        <CookieWarningBanner cookieReason={cookie.cookieReason} onUpdate={() => nav.navigate("settings")} onDismiss={cookie.dismiss} />
      )}

      <div className="app-body">
        <Sidebar open={sidebarOpen} navigate={nav.navigate} currentPage={nav.page} authStatus={nav.authStatus} />
        {/* Solo sul telefono (il CSS lo mostra solo lì): toccare fuori dal
            pannello lo chiude, come ci si aspetta da un menu che copre la pagina. */}
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
        <main className="main-content" style={{ paddingBottom: 24 }}>
          <AppRoutes page={nav.page} pageParams={nav.pageParams} navigate={nav.navigate} authStatus={nav.authStatus} loadAuthStatus={nav.loadAuthStatus} />
        </main>
      </div>
    </div>
  );
}
