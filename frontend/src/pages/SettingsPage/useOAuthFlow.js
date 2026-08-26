import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../../api";
import { startOAuthImpl, logoutImpl } from "./oauthDeviceFlow";

// Il polling gira SOLO mentre si aspetta che l'utente autorizzi su
// google.com/device: prima girava sempre, una richiesta ogni 3 secondi per
// tutto il tempo a pagina aperta.
function usePollWhileWaiting(oauthStep, loadStatus) {
  useEffect(() => {
    if (oauthStep !== "waiting") return;
    const interval = setInterval(loadStatus, 3000);
    return () => clearInterval(interval);
  }, [oauthStep, loadStatus]);
}

/** Stato dell'account Google collegato: lettura periodica + device flow. */
export function useOAuthFlow(addToast) {
  const [status, setStatus] = useState(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [oauthStep, setOauthStep] = useState("idle"); // idle | waiting | done
  const [device, setDevice] = useState(null); // { user_code, verification_url } durante il device flow
  const pollRef = useRef();

  // `oauthStep` letto dall'aggiornatore di stato e non dalla closure: quando
  // il timer partiva al montaggio, la funzione che eseguiva ogni 3 secondi era
  // quella del primo render, dove oauthStep vale sempre "idle".
  const loadStatus = useCallback(async () => {
    try {
      const s = await api.authStatus();
      setStatus(s);
      if (s.authenticated) setOauthStep(step => (step === "waiting" ? "done" : step));
    } catch { /* si riprova al giro successivo */ }
  }, []);

  useEffect(() => { loadStatus(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  usePollWhileWaiting(oauthStep, loadStatus);
  useEffect(() => () => clearInterval(pollRef.current), []);

  const setters = { setDevice, setOauthStep, loadStatus };
  const startOAuth = () => startOAuthImpl(clientId, clientSecret, pollRef, setters, addToast);
  const handleLogout = () => logoutImpl(pollRef, setters, addToast);

  return {
    status, clientId, setClientId, clientSecret, setClientSecret,
    oauthStep, device, startOAuth, handleLogout, loadStatus,
  };
}
