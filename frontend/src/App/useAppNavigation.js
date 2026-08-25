import { useState, useRef, useEffect, useCallback } from "react";
import { pageToUrl, urlToPage } from "./routing";

function usePopStateSync(setPage, setPageParams, depthRef) {
  useEffect(() => {
    function onPopState(e) {
      const { page: p, params } = e.state || urlToPage();
      depthRef.current = e.state?.depth || 0;
      setPage(p);
      setPageParams(params);
      window.scrollTo(0, 0);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Pagina corrente + navigazione, sincronizzate con la vera History API del browser. */
export function useAppNavigation(mobileLayout, setSidebarOpen) {
  const [page, setPage] = useState(() => urlToPage().page);
  const [pageParams, setPageParams] = useState(() => urlToPage().params);
  // Quante pagine sono state aperte da dentro l'app: serve al tasto Indietro
  // di Android per sapere se c'è ancora dove tornare.
  const depthRef = useRef(0);

  // Al primo avvio la pagina corrente non ha ancora una entry nella
  // cronologia con lo state giusto: la registriamo subito, così anche il
  // primissimo "Indietro" ha di che tornare.
  useEffect(() => {
    window.history.replaceState({ page, params: pageParams, depth: 0 }, "", pageToUrl(page, pageParams));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  usePopStateSync(setPage, setPageParams, depthRef);

  const navigate = useCallback((to, params = {}) => {
    setPage(to);
    setPageParams(params);
    // Sul telefono il pannello laterale copre la pagina: se restasse aperto
    // dopo aver scelto una voce si finirebbe su una pagina che non si vede.
    if (mobileLayout) setSidebarOpen(false);
    window.scrollTo(0, 0);
    depthRef.current += 1;
    window.history.pushState({ page: to, params, depth: depthRef.current }, "", pageToUrl(to, params));
  }, [mobileLayout, setSidebarOpen]);

  return { page, pageParams, navigate, depthRef };
}
