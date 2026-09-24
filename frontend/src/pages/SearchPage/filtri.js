import { SEARCH_FILTER_KEYS } from "../../App/routing";

/**
 * I filtri della ricerca, come nel pannello "Filtri" di YouTube. I valori sono
 * quelli di /api/search (server/ytdlp/search_filters.py, dove c'è anche perché
 * manca l'ordinamento per data: YouTube non lo rispetta più).
 *
 * `predefinito` è l'opzione che vale quando il filtro non c'è: sceglierla
 * toglie il filtro, così l'URL resta pulito (niente `ordina=pertinenza`).
 */
export const GRUPPI = [
  { chiave: "data", titolo: "Data di caricamento", opzioni: [
    ["ora", "Ultima ora"], ["oggi", "Oggi"], ["settimana", "Questa settimana"],
    ["mese", "Questo mese"], ["anno", "Quest'anno"]] },
  { chiave: "tipo", titolo: "Tipo", opzioni: [["video", "Video"], ["canale", "Canale"], ["playlist", "Playlist"]] },
  { chiave: "durata", titolo: "Durata", opzioni: [
    ["breve", "Meno di 4 minuti"], ["media", "4-20 minuti"], ["lunga", "Più di 20 minuti"]] },
  { chiave: "ordina", titolo: "Ordina per", predefinito: "pertinenza", prefisso: "Ordinati per ", opzioni: [
    ["pertinenza", "Pertinenza"], ["visualizzazioni", "Visualizzazioni"]] },
];

/**
 * Durata e data riguardano solo i video: con tipo canale o playlist non si
 * applicano (il server le scarta, il pannello le disattiva).
 */
export function soloPerVideo(chiave, filtri) {
  return (chiave === "durata" || chiave === "data") && (filtri.tipo === "canale" || filtri.tipo === "playlist");
}

/**
 * Solo i filtri validi e applicabili fra i parametri della pagina (che
 * arrivano dall'URL, quindi possono contenere di tutto: un link vecchio, un
 * valore scritto a mano). Stessa regola del server.
 */
export function filtriValidi(params) {
  const filtri = {};
  for (const g of GRUPPI) {
    const v = params[g.chiave];
    if (v && v !== g.predefinito && g.opzioni.some(([valore]) => valore === v)) filtri[g.chiave] = v;
  }
  for (const k of SEARCH_FILTER_KEYS) if (soloPerVideo(k, filtri)) delete filtri[k];
  return filtri;
}

/** I filtri dopo aver toccato un'opzione: la stessa opzione di nuovo la toglie, come su YouTube. */
export function conOpzione(filtri, chiave, valore) {
  const nuovi = { ...filtri };
  if (filtri[chiave] === valore) delete nuovi[chiave];
  else nuovi[chiave] = valore;
  return filtriValidi(nuovi);
}

/**
 * Etichetta leggibile di un filtro attivo, per il chip che lo mostra (e lo
 * toglie). `prefisso` dove l'opzione da sola sarebbe ambigua: un chip
 * "Visualizzazioni" non dice che è un ordinamento.
 */
export function etichetta(chiave, valore) {
  const gruppo = GRUPPI.find(g => g.chiave === chiave);
  const testo = gruppo?.opzioni.find(([v]) => v === valore)?.[1] || valore;
  return gruppo?.prefisso ? gruppo.prefisso + testo.toLowerCase() : testo;
}
