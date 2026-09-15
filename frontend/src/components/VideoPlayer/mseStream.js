// mseStream.js — apre /api/mux come MediaSource invece che come <video src>:
// il frontend legge lo stream da sé (fetch) e lo appende a un SourceBuffer,
// così il buffering non dipende più dall'euristica del browser sui flussi
// "di durata ignota" (vedi CLAUDE.md, sezione Riproduzione). Il resto del
// player non sa che questo file esiste: lo usa solo useStreamSource.js, che
// decide se questa strada è disponibile o si ripiega su <video src>.
import { pompa } from "./msePump";

// Costruisce davvero il MediaSource una volta deciso di procedere: SOLO da
// qui in poi si tocca `video` (src/load()) — prima di questo punto,
// `creaFlussoMse` può ancora tirarsi indietro senza aver lasciato tracce.
async function avviaMse(video, risposta, { mime, offset, keyframeStart, durata }, cb) {
  const ms = new MediaSource();
  const objectUrl = URL.createObjectURL(ms);
  video.src = objectUrl;
  video.load();
  await new Promise(r => ms.addEventListener("sourceopen", r, { once: true }));
  const sb = ms.addSourceBuffer(mime);
  sb.mode = "sequence";
  // Durata reale del contenuto in arrivo: da `keyframeStart` (dove ffmpeg è
  // atterrato per davvero), non da `offset` (il valore grezzo richiesto,
  // usato solo per la posizione mostrata) — sennò gli ultimi secondi veri
  // arriverebbero oltre la durata dichiarata al MediaSource.
  if (durata > keyframeStart) { try { ms.duration = durata - keyframeStart; } catch { /* solo cosmetico */ } }
  const chiuso = { current: false };
  const reader = risposta.body.getReader();
  pompa(reader, sb, video, chiuso, cb);
  return {
    offset,
    finalizza: () => { try { if (ms.readyState === "open") ms.endOfStream(); } catch { /* già chiuso */ } },
    chiudi: () => {
      chiuso.current = true;
      try { reader.cancel(); } catch { /* ignorato: stiamo comunque chiudendo */ }
      URL.revokeObjectURL(objectUrl);
    },
  };
}

// `rawStart` è il secondo grezzo richiesto (quello che il player mostra in
// barra come `offset + currentTime`, con lo stesso scarto di ≤1 GOP già
// accettato altrove — vedi CLAUDE.md); il vero punto di atterraggio arriva
// dall'header `X-Mux-Start` e serve solo per calcolare `ms.duration`.
//
// Ritorna `null` — SENZA aver toccato `video` — se il browser non supporta
// MediaSource, il codec dichiarato dal server (header `X-Mux-Codecs`, vedi
// streaming.py) o se il fetch fallisce: è il segnale per chi chiama di usare
// il ripiego <video src>, che resta l'unico a decidere src/load()/velocità
// in quel caso, in un solo posto (vedi useStreamSource.js).
export async function creaFlussoMse(video, url, { rawStart = 0, durata, onBuffer, onEnd, onError } = {}) {
  if (typeof MediaSource === "undefined") return null;
  const risposta = await fetch(url).catch(() => null);
  if (!risposta?.ok || !risposta.body) return null;
  const codecs = risposta.headers.get("X-Mux-Codecs");
  const keyframeStart = parseFloat(risposta.headers.get("X-Mux-Start")) || rawStart;
  const mime = codecs ? `video/mp4; codecs="${codecs}"` : "";
  if (!mime || !MediaSource.isTypeSupported(mime)) { risposta.body.cancel().catch(() => {}); return null; }
  return avviaMse(video, risposta, { mime, offset: rawStart, keyframeStart, durata }, {
    onBufferChange: () => onBuffer?.(),
    onEnd: t => onEnd?.(t),
    onError: e => onError?.(e),
  });
}
