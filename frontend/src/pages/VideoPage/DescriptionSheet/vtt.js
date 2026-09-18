// Lettura di un file .vtt (sottotitoli) in un elenco di righe con il secondo
// di partenza. Funzioni pure, niente React: si prova anche da sola con node.
//
// I sottotitoli automatici di YouTube (ASR) non sono un testo già pronto: sono
// pensati per essere MOSTRATI, non letti. Due conseguenze, entrambe da
// correggere qui o la trascrizione esce illeggibile.
//
//   1. Ogni parola porta con sé il momento in cui viene pronunciata, come tag
//      inline: `Bene<00:00:00.440><c> amici,</c><00:00:00.840><c> recensione</c>`.
//   2. Le cue si sovrappongono a coppie per dare l'effetto "riga che scorre":
//      la cue nuova RIPETE la riga precedente e le aggiunge sotto quella nuova,
//      e in mezzo c'è una cue di 10 millisecondi con la sola riga vecchia.
//      Su un file vero (recensione italiana, ~11 minuti) sono 955 cue per 322
//      righe di parlato: senza deduplica ogni frase comparirebbe tre volte.

// "00:01:02.345" → 62.345. Accetta anche "01:02.345" (senza ore) e la virgola
// decimale. Ritorna null se non è un timestamp, così il chiamante salta il blocco.
export function _secondiDaTimestamp(ts) {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:[.,]\d+)?)$/.exec(String(ts).trim());
  if (!m) return null;
  return Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3].replace(",", "."));
}

// Via i tag inline (`<00:00:01.234>`, `<c>`, `</c>`) e gli spazi doppi che
// restano. La regex si ferma al primo `>`: non tocca apostrofi, accenti o
// lettere accentate italiane, e un `<` senza chiusura resta dov'è.
export function _pulisci(testo) {
  return String(testo || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Quanto di `testo` è davvero nuovo rispetto alla cue precedente.
 *
 * Il confronto è a parole (non a caratteri): la coda di `prec` che coincide con
 * la testa di `testo` è la parte già mostrata e va tolta. Copre da sola tutti i
 * casi dell'ASR — cue identica (resta "", si scarta), cue che ricomincia dalla
 * riga precedente (resta solo la riga nuova), cue che ripete solo un pezzo.
 */
export function _scartaRipetizione(prec, testo) {
  const vecchie = prec ? prec.split(" ") : [];
  const nuove = testo.split(" ");
  const max = Math.min(vecchie.length, nuove.length);
  for (let k = max; k > 0; k--) {
    const coda = vecchie.slice(vecchie.length - k).join(" ");
    if (coda === nuove.slice(0, k).join(" ")) return nuove.slice(k).join(" ");
  }
  return testo;
}

/** Testo di un .vtt → `[{ start: secondi, text }]`, già deduplicato. */
export function parseVtt(testoVtt) {
  const righe = [];
  let prec = "";
  // Separatore fra cue: una riga DAVVERO vuota. Una riga di soli spazi non lo
  // è, ed è proprio quello che YouTube mette come prima riga di molte cue
  // (la "riga vuota" in cima al sottotitolo che scorre): trattarla da
  // separatore spezzava la cue in due e ne perdeva il testo.
  for (const blocco of String(testoVtt || "").split(/\r?\n\r?\n/)) {
    const linee = blocco.split(/\r?\n/);
    const iTempo = linee.findIndex(l => l.includes("-->"));
    if (iTempo < 0) continue;
    const start = _secondiDaTimestamp(linee[iTempo].split("-->")[0]);
    if (start === null) continue;
    const testo = _pulisci(linee.slice(iTempo + 1).join(" "));
    if (!testo) continue;
    const nuovo = _scartaRipetizione(prec, testo);
    prec = testo;
    if (nuovo) righe.push({ start, text: nuovo });
  }
  return righe;
}
