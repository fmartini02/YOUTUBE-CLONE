import { useState, useEffect, useCallback } from "react";
import { api, isCapacitor, getServerBase, checkServerReachable } from "../api";

// Sul web/Electron il frontend è servito dallo stesso server (nessun setup
// necessario). Nell'app Android il server va indicato esplicitamente la
// prima volta (o quando quello salvato non risponde più, es. IP cambiato).
function useServerReady() {
  const [serverReady, setServerReady] = useState(!isCapacitor());
  useEffect(() => {
    if (!isCapacitor()) return;
    const base = getServerBase();
    if (!base) { setServerReady(false); return; }
    checkServerReachable(base).then(setServerReady);
  }, []);
  return [serverReady, setServerReady];
}

export function useAuthStatusPolling() {
  const [serverReady, setServerReady] = useServerReady();
  const [authStatus, setAuthStatus] = useState(null);

  // Esposta anche alle pagine (onSubsChange): iscriversi o disiscriversi
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

  return { serverReady, setServerReady, authStatus, loadAuthStatus };
}
