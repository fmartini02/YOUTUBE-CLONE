import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import CookieWarningBanner from "./CookieWarningBanner";
import AppRoutes from "./AppRoutes";

// Col widget aperto sopra una pagina che non è quella del video, le pagine
// hanno in fondo lo spazio di un widget in più: l'ultima card si può sempre
// scorrere fuori da sotto di lui. Sta nello stile dell'elemento e non in
// App.css perché quello scritto nell'elemento vince.
function spazioInFondo(mini) {
  return { paddingBottom: mini ? "calc(24px + var(--mini-w) * 9 / 16)" : 24 };
}

export default function AppLayout({ nav, cookie, sidebarOpen, setSidebarOpen }) {
  const mini = !!nav.widget && nav.page !== "video";
  return (
    <div className="app" data-sidebar={sidebarOpen} data-cookie-banner={cookie.cookieWarning} data-mini={mini}>
      <Header
        navigate={nav.navigate} currentQuery={nav.pageParams.query || ""}
        sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} authStatus={nav.authStatus}
      />

      {cookie.cookieWarning && (
        <CookieWarningBanner cookieReason={cookie.cookieReason} onUpdate={() => nav.navigate("settings")} onDismiss={cookie.dismiss} />
      )}

      <div className="app-body">
        <Sidebar open={sidebarOpen} navigate={nav.navigate} currentPage={nav.page} authStatus={nav.authStatus} />
        {/* Solo sul telefono (il CSS lo mostra solo lì): toccare fuori dal
            pannello lo chiude, come ci si aspetta da un menu che copre la pagina. */}
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
        <main className="main-content" style={spazioInFondo(mini)}>
          <AppRoutes nav={nav} />
        </main>
      </div>
    </div>
  );
}
