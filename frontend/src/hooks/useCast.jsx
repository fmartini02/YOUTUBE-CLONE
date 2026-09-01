import { useWebCast } from "./webCast";
import { useNativeCast } from "./nativeCast";

export { CAST_UNAVAILABLE_MESSAGE, CAST_ERROR_MESSAGE } from "./castConstants";

/**
 * Due backend Chromecast, scelti UNA volta sola all'avvio (la piattaforma non
 * cambia in corsa, quindi è un alias, non una chiamata condizionale di hook):
 *
 * - APK Android (WebView Capacitor): il Cast Web Sender di Google non esiste
 *   qui, si passa dal plugin nativo YtCast (hooks/nativeCast.js), che per di
 *   più espone un telecomando completo — `remote` con play/pausa, seek, ±10s,
 *   e nelle fasi successive qualità/sottotitoli/coda.
 * - Desktop (Chrome/Edge/Brave): Cast Web Sender (hooks/webCast.js). "Manda e
 *   basta", si comanda dal telecomando della TV; `remote` è null.
 *
 * Consumato una volta sola in App/index.jsx e riesposto via CastContext
 * all'unico CastButton (pagina video), a CastRemote e alla diagnostica.
 */
const NATIVE = typeof window !== "undefined" && !!window.Capacitor?.isNativePlatform?.();

export const useCast = NATIVE ? useNativeCast : useWebCast;
