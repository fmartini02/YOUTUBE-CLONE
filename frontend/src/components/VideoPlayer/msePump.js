// msePump.js — il ciclo che legge lo stream di rete a pezzi e li appende al
// SourceBuffer, con backpressure propria: senza un tetto, un video intero
// finirebbe scaricato in RAM anche se l'utente lo guarda in pausa da fermo
// (il problema opposto a quello che MSE doveva risolvere). Isolato da
// mseStream.js, che lo avvia, per restare sotto le 5 funzioni per file.
import { appendiConQuota, liberaDietro } from "./mseBuffer";
import { MSE_TARGET_AHEAD_S, MSE_CHUNK_MIN_BYTES, MSE_POLL_MS, MSE_POLL_MS_PAUSA } from "./playerConstants";

// Aspetta che ci sia "spazio" per scaricare ancora — il buffer avanti alla
// posizione attuale è sotto MSE_TARGET_AHEAD_S — o che il flusso sia stato
// chiuso da fuori (cambio video, salto, smontaggio del player): in quel
// caso risolve `false`, segnale per pompa() di fermarsi subito. Col video in
// pausa (e quindi già col buffer pieno, il caso comune) il polling rallenta
// da sé a MSE_POLL_MS_PAUSA: nessuno sta guardando in tempo reale, un
// controllo ogni 400ms all'infinito sprecherebbe solo batteria.
function attendiSpazio(video, sb, chiuso) {
  return new Promise(resolve => {
    const tick = () => {
      if (chiuso.current) return resolve(false);
      const fine = sb.buffered.length ? sb.buffered.end(sb.buffered.length - 1) : 0;
      if (fine - video.currentTime < MSE_TARGET_AHEAD_S) return resolve(true);
      setTimeout(tick, video.paused ? MSE_POLL_MS_PAUSA : MSE_POLL_MS);
    };
    tick();
  });
}

function unisci(chunks, totale) {
  const out = new Uint8Array(totale);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.length; }
  return out;
}

function fineBuffer(sb) {
  return sb.buffered.length ? sb.buffered.end(sb.buffered.length - 1) : 0;
}

// Il ciclo vero: legge dal reader, accumula i chunk piccoli (arrivano spesso
// a pochi KB dalla rete, un appendBuffer ciascuno costerebbe più del
// guadagno) fino a MSE_CHUNK_MIN_BYTES, appende, libera il buffer già visto,
// ripete finché il reader non finisce o `chiuso.current` diventa vero.
// `cb`: `onBufferChange()` dopo ogni append (aggiorna la barra), `onEnd(t)`
// quando il reader finisce (a chi chiama sta decidere se è la fine vera del
// video o un taglio prematuro — pompa() non conosce la durata totale),
// `onError(e)` su un errore che non sia una chiusura volontaria.
export async function pompa(reader, sb, video, chiuso, cb) {
  let coda = [];
  let codaBytes = 0;
  const svuota = async () => {
    if (!codaBytes) return;
    const chunk = coda.length === 1 ? coda[0] : unisci(coda, codaBytes);
    coda = []; codaBytes = 0;
    await appendiConQuota(sb, chunk, video);
    cb.onBufferChange();
  };
  try {
    while (!chiuso.current) {
      if (!(await attendiSpazio(video, sb, chiuso))) break;
      const { done, value } = await reader.read();
      if (done) { await svuota(); cb.onEnd(fineBuffer(sb)); return; }
      coda.push(value);
      codaBytes += value.length;
      if (codaBytes >= MSE_CHUNK_MIN_BYTES) await svuota();
      await liberaDietro(sb, video);
    }
    await svuota();
  } catch (e) {
    if (!chiuso.current) cb.onError(e);
  }
}
