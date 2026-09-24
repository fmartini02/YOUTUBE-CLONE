/**
 * Posizione del widget (mini-player).
 *
 * Non si salva in pixel ma come frazione 0..1 dell'area libera (`--mx`,
 * `--my`: 0 = bordo sinistro/alto dell'area, 1 = destro/basso), e il punto
 * vero lo calcola il CSS (vedi "MINI-PLAYER" in App.css) con le variabili che
 * esistono già: altezza dell'header e del banner cookie, larghezza della barra
 * laterale. Così rotazione del telefono, chiusura del banner, apertura della
 * barra laterale o una finestra ridimensionata rimettono il widget al posto
 * giusto da sole — senza ascoltatori di eventi, e senza che la posizione
 * salvata si rovini (in pixel, dopo una rotazione, finirebbe fuori schermo).
 */

const CHIAVE = "ytproxy_mini_pos";
// In basso a destra, come su YouTube.
const PREDEFINITA = { x: 1, y: 1 };

const limita = v => Math.max(0, Math.min(1, v));

/** Ultima posizione scelta. localStorage può mancare o lanciare (profilo privato, WebView ristretta). */
export function leggiPosizione() {
  try {
    const p = JSON.parse(localStorage.getItem(CHIAVE));
    if (Number.isFinite(p?.x) && Number.isFinite(p?.y)) return { x: limita(p.x), y: limita(p.y) };
  } catch { /* posizione predefinita */ }
  return PREDEFINITA;
}

export function salvaPosizione(p) {
  try { localStorage.setItem(CHIAVE, JSON.stringify(p)); } catch { /* resta solo per questa sessione */ }
}

/** Scritte direttamente sull'elemento: durante il trascinamento niente render React ad ogni pixel. */
export function applicaPosizione(el, p) {
  el.style.setProperty("--mx", String(p.x));
  el.style.setProperty("--my", String(p.y));
}

/**
 * Da uno spostamento del dito (dx, dy rispetto a dove il widget stava a inizio
 * gesto) alla frazione dell'area. L'area la dà `.mini-area`, un elemento fisso
 * invisibile con gli stessi bordi del widget (vedi pages/VideoPage/index.jsx):
 * misurarla lì evita di ricalcolare in JS header, banner e barra laterale.
 * Se l'area è più piccola del widget (finestra minuscola) la frazione resta 0.
 */
export function posizioneDa(rect, dx, dy) {
  const area = document.querySelector(".mini-area")?.getBoundingClientRect();
  if (!area) return null;
  const libera = (inizio, bordo, spazio) => (spazio > 0 ? limita((inizio - bordo) / spazio) : 0);
  return {
    x: libera(rect.left + dx, area.left, area.width - rect.width),
    y: libera(rect.top + dy, area.top, area.height - rect.height),
  };
}
