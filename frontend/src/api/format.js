export function formatDuration(secs) {
  if (!secs) return "";
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  if (h) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Numero abbreviato all'italiana: "1,2 Mln", "45,3 Mila", "912".
 * Serve dove il numero sta da solo (mi piace, conteggio commenti); per le
 * visualizzazioni c'è formatViews, che gli aggiunge l'etichetta.
 */
export function formatCompact(n) {
  if (!n) return "";
  const abbrevia = (v, u) => `${v.toFixed(1).replace(".", ",")} ${u}`;
  if (n >= 1e9) return abbrevia(n / 1e9, "Mld");
  if (n >= 1e6) return abbrevia(n / 1e6, "Mln");
  if (n >= 1e3) return abbrevia(n / 1e3, "Mila");
  return String(n);
}

export function formatViews(n) {
  if (!n) return "";
  return `${formatCompact(n)} visualizzazioni`;
}

export function formatDate(s) {
  if (!s) return "";
  return new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`)
    .toLocaleDateString("it-IT", { year: "numeric", month: "short", day: "numeric" });
}

// Unità in ordine dalla più lunga: la prima che ci sta dentro almeno una volta
// è quella da usare. Singolare e plurale sono entrambi scritti perché in
// italiano non si ricavano l'uno dall'altro ("1 mese" / "3 mesi").
const ETA_UNITA = [
  [31557600, "anno", "anni"],
  [2629800, "mese", "mesi"],
  [604800, "settimana", "settimane"],
  [86400, "giorno", "giorni"],
  [3600, "ora", "ore"],
  [60, "minuto", "minuti"],
];

export function timeAgo(ts) {
  if (!ts) return "";
  const diff = (Date.now() / 1000) - ts;
  if (diff < 60) return "adesso";
  for (const [secondi, singolare, plurale] of ETA_UNITA) {
    const n = Math.floor(diff / secondi);
    if (n >= 1) return `${n} ${n === 1 ? singolare : plurale} fa`;
  }
  return "adesso";
}
