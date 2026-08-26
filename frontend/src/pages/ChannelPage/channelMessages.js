export const PAGE_SIZE = 30;

// Perché la lista è vuota: sono due casi diversi, e solo uno è un problema.
export const EMPTY_MESSAGES = {
  "canale-non-trovato": {
    title: "Canale non raggiungibile",
    body: "YouTube non ha restituito nulla per questo canale: potrebbe essere stato chiuso o rinominato. Prova a sincronizzare di nuovo le iscrizioni dalle Impostazioni.",
  },
  "nessun-video": {
    title: "Nessun video pubblicato",
    body: "Questo canale non ha video nella scheda Video (potrebbe avere solo Short o dirette).",
  },
  errore: {
    title: "Errore nel caricamento del canale",
    body: "Il server non ha risposto. Controlla che sia attivo e riprova.",
  },
};

export function formatSubscribers(n) {
  if (!n) return "";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(".0", "")} Mln di iscritti`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(".0", "")} mila iscritti`;
  return `${n} iscritti`;
}
