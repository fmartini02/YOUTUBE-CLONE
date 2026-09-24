import { pageToUrl } from "./routing";

/**
 * Regole della cronologia con il mini-player (widget).
 *
 * Il video non è una pagina come le altre ma uno "strato" sopra di esse, come
 * nell'app di YouTube: tornando Indietro da un video si torna alla schermata da
 * cui lo si era aperto, e il video continua nel widget. Per ottenerlo senza
 * saltare voci a posteriori (fragile: profondità 0, widget chiuso, render
 * intermedi con il video sbagliato) vale un invariante:
 *
 *   nella cronologia c'è AL MASSIMO UNA voce video, e sempre in cima.
 *
 * Lo mantengono le regole qui sotto: da un video si sostituisce sempre la voce
 * (verso un altro video o verso una pagina qualsiasi, che manda il video nel
 * widget), mentre da una pagina normale si aggiunge. Così sotto la cima non
 * esistono mai voci video "vecchie" da saltare. Le voci create dalle versioni
 * precedenti dell'app (senza `sotto`) si comportano come allora.
 *
 * `sotto` è l'URL della schermata che sta sotto la voce video: se dal video si
 * va proprio lì (tipico: "Home" nella barra laterale) si torna indietro invece
 * di sostituire, altrimenti la cronologia diventerebbe [home, home] e il primo
 * Indietro dalla home ricaricherebbe la home stessa. Confronto sugli URL e non
 * sui parametri: quelli del canale contengono `channelName`, che nell'URL non
 * c'è, quindi la stessa pagina risulterebbe diversa.
 */

/** "push" | "replace" | "back": cosa fare della cronologia andando da `corrente` (history.state) a `to`. */
export function operazioneCronologia(corrente, to, params) {
  if (corrente?.page !== "video") return "push";
  if (to !== "video" && corrente.sotto && corrente.sotto === pageToUrl(to, params)) return "back";
  return "replace";
}

/** La schermata sotto la nuova voce: solo le voci video ne hanno una. */
export function sottoPer(corrente, to) {
  if (to !== "video") return undefined;
  if (corrente?.page === "video") return corrente.sotto;
  return corrente?.page ? pageToUrl(corrente.page, corrente.params) : undefined;
}

/**
 * Stato di navigazione dopo essere arrivati su `page` (con navigate o col
 * tasto Indietro/Avanti). Pagina, parametri e video del widget cambiano in un
 * solo colpo: se il widget si aggiornasse in un secondo momento, VideoPage
 * riceverebbe per un render il video sbagliato — il player si azzererebbe e
 * partirebbero /api/watch e /api/mux proprio mentre si vuole il contrario.
 *
 * Il widget tiene l'ultimo video aperto. Fa eccezione il cast: se quel video
 * sta girando sulla TV, uscendo dalla pagina non resta nessun widget (il
 * player locale non c'è, al suo posto c'è il telecomando) — come prima di
 * questa funzione, quando uscire dalla pagina video la smontava sempre.
 */
export function prossimoStato(prec, page, params, castingVideoId) {
  let widget = prec.widget;
  if (page === "video") widget = params.videoId || null;
  else if (prec.page === "video" && castingVideoId && castingVideoId === widget) widget = null;
  return { page, params, widget };
}
