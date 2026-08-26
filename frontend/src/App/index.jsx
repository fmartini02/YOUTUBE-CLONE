import { useState, createContext, useContext } from "react";
import { useCast } from "../hooks/useCast.jsx";
import { useMobileLayout } from "../hooks/useMediaQuery";
import { PrefsProvider } from "../hooks/usePrefs";
import ServerSetup from "../components/ServerSetup";
import { useAppNavigation } from "./useAppNavigation";
import { useBackButton } from "./useBackButton";
import { useAuthStatusPolling } from "./useAuthStatusPolling";
import { useCookieWarning } from "./useCookieWarning";
import AppLayout from "./AppLayout";
import "../App.css";

// Cast context — l'SDK Chromecast si inizializza una volta sola qui e viene
// consumato dall'unico bottone Cast (pagina video) e dalla diagnostica nelle
// impostazioni.
export const CastContext = createContext(null);
export function useCastContext() { return useContext(CastContext); }

export default function App() {
  // PrefsProvider avvolge tutto: applica il tema salvato all'elemento <html>,
  // quindi deve valere anche per la schermata di configurazione del server —
  // che sta dietro un return anticipato di AppInterno.
  return (
    <PrefsProvider>
      <AppInterno />
    </PrefsProvider>
  );
}

function AppInterno() {
  // Come YouTube vero: di default la sidebar è la barra stretta (icona sopra
  // etichetta), non quella larga — si espande solo cliccando l'hamburger.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const castSDK = useCast();
  // Sul telefono la barra laterale non sta ACCANTO alla pagina ma SOPRA:
  // cambia il comportamento, non solo la larghezza, quindi va saputo anche in
  // JS e non solo nel CSS.
  const mobileLayout = useMobileLayout();
  const auth = useAuthStatusPolling();
  const nav = useAppNavigation(mobileLayout, setSidebarOpen);
  useBackButton(sidebarOpen, setSidebarOpen, nav.depthRef);
  const cookie = useCookieWarning(auth.authStatus);

  if (!auth.serverReady) {
    return <ServerSetup onDone={() => auth.setServerReady(true)} />;
  }

  return (
    <CastContext.Provider value={castSDK}>
      <AppLayout
        nav={{ ...nav, authStatus: auth.authStatus, loadAuthStatus: auth.loadAuthStatus }}
        cookie={cookie}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />
    </CastContext.Provider>
  );
}
