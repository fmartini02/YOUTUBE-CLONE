import { useState } from "react";

// Quale problema l'utente ha già scelto di ignorare.
const COOKIE_BANNER_KEY = "ytproxy_cookie_banner_off";

export const COOKIE_WARNING_TEXT = {
  stale: "I tuoi cookie YouTube hanno più di 2 settimane — aggiornali per il feed personalizzato.",
  // Caso diverso e più insidioso: il file c'è ma per YouTube sei anonimo,
  // quindi riesportarlo dallo stesso browser non cambierebbe niente.
  "not-logged-in": "I cookie caricati non contengono una sessione YouTube: apri youtube.com nel browser (non solo google.com), poi reimportali.",
};

/**
 * Avviso cookie: si può chiudere, ma la chiusura vale per QUEL problema. Se
 * il motivo cambia (i cookie erano solo vecchi e ora manca la sessione
 * YouTube) l'avviso ricompare, perché è un'altra cosa da sistemare.
 */
export function useCookieWarning(authStatus) {
  const [dismissedCookieReason, setDismissedCookieReason] = useState(
    () => localStorage.getItem(COOKIE_BANNER_KEY) || "",
  );
  const cookieReason = authStatus?.cookie?.present ? authStatus.cookie.reason : null;
  const cookieWarning = !!cookieReason && dismissedCookieReason !== cookieReason;

  const dismiss = () => {
    localStorage.setItem(COOKIE_BANNER_KEY, cookieReason);
    setDismissedCookieReason(cookieReason);
  };

  return { cookieReason, cookieWarning, dismiss };
}
