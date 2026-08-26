import { apiFetch } from "./core";
import { getLanBase, isCastableOrigin } from "./base";

/**
 * Base da dare al Chromecast, anche quando il sito è aperto su localhost.
 *
 * Il caso normale è proprio quello: server e browser sullo stesso PC. Prima
 * ci si limitava a rifiutare la trasmissione, così il selettore dei
 * dispositivi non si apriva mai; adesso l'indirizzo di rete lo chiediamo al
 * server, che è l'unico a saperlo davvero (con più schede di rete indovinarlo
 * dal browser non è possibile). Il risultato si chiede una volta sola.
 */
let castBasePromise = null;

export function resolveCastBase() {
  if (isCastableOrigin()) return Promise.resolve(getLanBase());
  if (!castBasePromise) {
    castBasePromise = apiFetch("/api/lan-address")
      .then(d => d.address || "")
      .catch(() => "");
  }
  return castBasePromise;
}

/** Prova a raggiungere /api/health su un indirizzo, con timeout breve — usato dall'onboarding per validare l'IP prima di salvarlo. */
export async function checkServerReachable(url, timeoutMs = 4000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url.replace(/\/+$/, "") + "/api/health", { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}
