import { useEffect } from "react";
import { handleBack } from "./backHandlers";

/**
 * Tasto Indietro / gesture di Android. Capacitor 8 non gestisce più il tasto
 * da sé: senza il plugin @capacitor/app l'app si chiudeva invece di tornare
 * indietro. MainActivity.java gira il tasto a questa funzione, che risponde
 * se lo ha gestito lei — altrimenti l'app si chiude, come dalla schermata
 * iniziale di qualsiasi app.
 *
 * Il conteggio in `depthRef` serve perché `history.length` conta anche quello
 * che c'era prima dell'app, e `history.back()` su una cronologia vuota non fa
 * niente: senza, si resterebbe bloccati sulla stessa schermata.
 */
export function useBackButton(sidebarOpen, setSidebarOpen, depthRef) {
  useEffect(() => {
    window.ytproxyHandleBack = () => {
      if (sidebarOpen) { setSidebarOpen(false); return true; }
      if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return true; }
      // Pannelli a comparsa (descrizione del video, e chi verrà dopo): si
      // registrano in backHandlers.js mentre sono aperti. Vanno consultati
      // PRIMA di navigare, altrimenti il tasto Indietro porterebbe via dalla
      // pagina lasciando credere che il pannello non si chiuda affatto.
      if (handleBack()) return true;
      if (depthRef.current > 0) { window.history.back(); return true; }
      return false;
    };
    return () => { delete window.ytproxyHandleBack; };
  }, [sidebarOpen]); // eslint-disable-line react-hooks/exhaustive-deps
}
