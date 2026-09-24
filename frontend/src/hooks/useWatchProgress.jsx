import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { api } from "../api";

/**
 * Fin dove è stato visto ogni video della cronologia, `{ id: { position,
 * duration } }`: lo leggono le barrette rosse sotto le miniature
 * (components/WatchProgressBar.jsx).
 *
 * Si carica dal server all'avvio e ogni volta che l'app torna in primo piano
 * (un video visto a metà sulla TV o sul telefono deve comparire anche qui), e
 * il player lo aggiorna in locale ad ogni salvataggio (`segnaProgresso`), così
 * la card del video appena lasciato mostra subito il punto giusto senza
 * rileggere tutta la mappa.
 */

const WatchProgressContext = createContext({ progressi: {}, segnaProgresso: () => {}, ricarica: () => {} });

export function useWatchProgress() {
  return useContext(WatchProgressContext);
}

export function WatchProgressProvider({ children }) {
  const [progressi, setProgressi] = useState({});

  const ricarica = useCallback(() => {
    api.progressMap().then(d => setProgressi(d.progress || {})).catch(() => {});
  }, []);

  useEffect(() => {
    ricarica();
    const onVisibile = () => { if (document.visibilityState === "visible") ricarica(); };
    document.addEventListener("visibilitychange", onVisibile);
    return () => document.removeEventListener("visibilitychange", onVisibile);
  }, [ricarica]);

  const segnaProgresso = useCallback((id, position, duration) => {
    setProgressi(p => ({ ...p, [id]: { position, duration: duration || p[id]?.duration } }));
  }, []);

  const value = useMemo(() => ({ progressi, segnaProgresso, ricarica }), [progressi, segnaProgresso, ricarica]);
  return <WatchProgressContext.Provider value={value}>{children}</WatchProgressContext.Provider>;
}
