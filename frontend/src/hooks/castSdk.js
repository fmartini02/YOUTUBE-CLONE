/**
 * Carica lo script dell'SDK Cast di Google una volta sola per pagina
 * (promessa condivisa fra tutte le istanze dell'hook useCast). Restituisce
 * {ok, reason}: quando fallisce, il motivo serve per poterlo dire all'utente.
 */
let sdkPromise = null;

// Nell'APK Android il cast non passa più di qui: useCast sceglie il ramo
// nativo (hooks/nativeCast.js) prima ancora di caricare questo SDK. Restano i
// runtime desktop dove il Cast Web Sender non c'è: Electron e i browser non
// Chromium.
function detectUnavailableReason() {
  if (/Electron/i.test(navigator.userAgent) || window.__YTPROXY_ELECTRON__) return "electron";
  if (!/Chrome|Edg|Brave|Chromium/i.test(navigator.userAgent)) return "browser";
  return null;
}

export function loadCastSdk() {
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise(resolve => {
    if (window.cast?.framework) return resolve({ ok: true });

    const motivoNoto = detectUnavailableReason();
    if (motivoNoto) return resolve({ ok: false, reason: motivoNoto });

    let done = false;
    const finish = (r) => { if (!done) { done = true; resolve(r); } };

    window.__onGCastApiAvailable = (isAvailable) =>
      finish(isAvailable ? { ok: true } : { ok: false, reason: "no-cast" });

    const script = document.createElement("script");
    script.id = "__cast_sdk_script";
    script.src = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
    // Tipicamente: Brave Shields o un adblocker che blocca gstatic.com.
    script.onerror = () => finish({ ok: false, reason: "blocked" });
    document.head.appendChild(script);

    // Lo script può caricarsi senza mai annunciare l'SDK (componente Cast
    // assente o disattivato nel browser): senza timeout resteremmo in attesa
    // per sempre e il bottone non direbbe mai cosa non va.
    setTimeout(() => finish(
      window.cast?.framework ? { ok: true } : { ok: false, reason: "timeout" },
    ), 8000);
  });

  return sdkPromise;
}
