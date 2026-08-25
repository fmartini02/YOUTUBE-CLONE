// Nell'app web/Electron il frontend è servito DAL server stesso, quindi
// BASE resta vuoto (stessa origine). Nell'app Android (Capacitor) invece il
// frontend è impacchettato nell'apk ma il server gira sul PC dell'utente:
// serve un indirizzo esplicito, impostato a runtime dalla schermata di
// onboarding (vedi ServerSetup) e salvato in localStorage — non è noto a
// build-time perché l'IP del PC può cambiare da un'installazione all'altra.
const BASE_KEY = "ytproxy_server_base";

export function getServerBase() {
  return localStorage.getItem(BASE_KEY) || import.meta.env.VITE_API_URL || "";
}

export function setServerBase(url) {
  localStorage.setItem(BASE_KEY, url.replace(/\/+$/, ""));
}

export function clearServerBase() {
  localStorage.removeItem(BASE_KEY);
}

/**
 * Indirizzo del server così come lo vede un ALTRO dispositivo della rete.
 *
 * Per il player del browser basta un percorso relativo, ma il Chromecast
 * scarica il video per conto suo: gli serve un URL assoluto e raggiungibile
 * dalla TV. "localhost" non va bene — per il Chromecast significherebbe sé
 * stesso — quindi in quel caso non si può trasmettere e va usato l'IP di rete.
 */
export function getLanBase() {
  const base = getServerBase() || (typeof window !== "undefined" ? window.location.origin : "");
  return base.replace(/\/+$/, "");
}

export function isCastableOrigin() {
  const base = getLanBase();
  return !!base && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(base);
}
