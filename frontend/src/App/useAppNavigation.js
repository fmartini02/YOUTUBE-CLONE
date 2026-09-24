import { useState, useRef, useEffect, useCallback } from "react";
import { pageToUrl, urlToPage } from "./routing";
import { operazioneCronologia, sottoPer, prossimoStato } from "./navHistory";

// Prima voce della cronologia. Se c'è già uno state (ricarica, ritorno da un
// altro sito) si tiene com'è, profondità compresa: prima la si riportava
// sempre a 0, e dopo una ricarica il tasto Indietro di Android credeva di non
// avere più dove tornare. Senza state, un /watch aperto direttamente (link,
// preferito) diventa [home, video]: così anche lì Indietro porta alla home col
// video nel widget invece di uscire dal sito. Il controllo su history.state
// regge anche il doppio effect dello StrictMode: al secondo giro lo state c'è.
function useCronologiaIniziale(nav, depthRef) {
  useEffect(() => {
    const st = window.history.state;
    if (st?.page) { depthRef.current = st.depth || 0; return; }
    if (nav.page !== "video") {
      window.history.replaceState({ page: nav.page, params: nav.params, depth: 0 }, "", pageToUrl(nav.page, nav.params));
      return;
    }
    window.history.replaceState({ page: "home", params: {}, depth: 0 }, "", "/");
    window.history.pushState({ page: "video", params: nav.params, depth: 1, sotto: "/" }, "", pageToUrl("video", nav.params));
    depthRef.current = 1;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

function usePopStateSync(setNav, depthRef, castRef) {
  useEffect(() => {
    function onPopState(e) {
      const { page: p, params } = e.state || urlToPage();
      depthRef.current = e.state?.depth || 0;
      setNav(n => prossimoStato(n, p, params, castRef.current?.castingVideoId));
      window.scrollTo(0, 0);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Pagina corrente + navigazione, sincronizzate con la vera History API del
 * browser, più il video del mini-player (`widget`). Le regole della cronologia
 * sono in navHistory.js.
 *
 * `castRef` e non lo stato del cast fra le dipendenze: cambia di continuo
 * (stato del player sulla TV) e ricreerebbe `navigate` ad ogni aggiornamento.
 */
export function useAppNavigation(mobileLayout, setSidebarOpen, castRef) {
  const [nav, setNav] = useState(() => {
    const { page, params } = urlToPage();
    return { page, params, widget: page === "video" ? params.videoId || null : null };
  });
  // Quante pagine sono state aperte da dentro l'app: serve al tasto Indietro
  // di Android per sapere se c'è ancora dove tornare.
  const depthRef = useRef(0);

  useCronologiaIniziale(nav, depthRef);
  usePopStateSync(setNav, depthRef, castRef);

  const navigate = useCallback((to, params = {}) => {
    // Sul telefono il pannello laterale copre la pagina: se restasse aperto
    // dopo aver scelto una voce si finirebbe su una pagina che non si vede.
    // Va chiuso anche nel ramo "back" qui sotto, che lascia il resto a popstate.
    if (mobileLayout) setSidebarOpen(false);
    // La voce corrente si legge da history.state, aggiornato in modo sincrono:
    // due navigate di fila vedono ognuno la voce lasciata dal precedente.
    const corrente = window.history.state;
    const op = operazioneCronologia(corrente, to, params);
    // Indietro è asincrono: pagina e widget li aggiorna popstate, qui niente
    // setNav — altrimenti ci sarebbe un render in più con lo stato sbagliato.
    if (op === "back") { window.history.back(); return; }
    if (op === "push") depthRef.current += 1;
    const voce = { page: to, params, depth: depthRef.current, sotto: sottoPer(corrente, to) };
    if (op === "push") window.history.pushState(voce, "", pageToUrl(to, params));
    else window.history.replaceState(voce, "", pageToUrl(to, params));
    setNav(n => prossimoStato(n, to, params, castRef.current?.castingVideoId));
    window.scrollTo(0, 0);
  }, [mobileLayout, setSidebarOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // X del widget: il video si ferma e la pagina video si smonta (chiude il flusso).
  const chiudiWidget = useCallback(() => setNav(n => ({ ...n, widget: null })), []);

  return { page: nav.page, pageParams: nav.params, widget: nav.widget, navigate, chiudiWidget, depthRef };
}
