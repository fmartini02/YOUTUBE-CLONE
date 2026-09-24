// mseStream.js — apre /api/mux come MediaSource invece che come <video src>:
// il frontend legge lo stream da sé (fetch) e lo appende a un SourceBuffer,
// così il buffering non dipende più dall'euristica del browser sui flussi
// "di durata ignota" (vedi CLAUDE.md, sezione Riproduzione). Il resto del
// player non sa che questo file esiste: lo usa solo useStreamSource.js, che
// decide se questa strada è disponibile o si ripiega su <video src>.
import { pompa } from "./msePump";
import { MSE_SOURCEOPEN_TIMEOUT_MS } from "./playerConstants";

// Aspetta `sourceopen` con un tetto (vedi MSE_SOURCEOPEN_TIMEOUT_MS): senza,
// un browser che non lo emette mai lascerebbe avviaMse() appesa per sempre.
function attendiSourceOpen(ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("sourceopen non arrivato")), MSE_SOURCEOPEN_TIMEOUT_MS);
    ms.addEventListener("sourceopen", () => { clearTimeout(t); resolve(); }, { once: true });
  });
}

// Estratta solo per restare sotto le 25 righe del catch sotto in un'unica riga.
function pulisciMse(objectUrl, risposta) {
  URL.revokeObjectURL(objectUrl);
  risposta.body.cancel().catch(() => {});
}

// Con la timeline sorgente il buffer non comincia per forza a 0 né
// esattamente al secondo chiesto: parte dove partono ENTRAMBE le tracce (a
// `start=0` l'Opus ha 7ms di pre-skip e il video comincia a 0.007; una
// sorgente con l'audio che attacca più tardi lascerebbe un buco più largo).
// Un playhead fermo prima dell'inizio del buffer aspetterebbe dati che non
// arriveranno mai: lo si porta all'inizio. Innocua dopo: il buffer liberato
// dietro al playhead (liberaDietro) non supera mai `currentTime`, e un salto
// dentro al buffer cade per definizione dopo il suo inizio. Niente guardia su
// `video.seeking`: un playhead iniziale prima del buffer resta in `seeking`
// per sempre, ed è proprio il caso da correggere.
function partenzaNelBuffer(video, sb) {
  if (!sb.buffered.length) return;
  const inizio = sb.buffered.start(0);
  if (video.currentTime < inizio) video.currentTime = inizio;
}

// Costruisce davvero il MediaSource una volta deciso di procedere: SOLO da
// qui in poi si tocca `video` (src/load()) — prima di questo punto,
// `creaFlussoMse` può ancora tirarsi indietro senza aver lasciato tracce. Da
// qui in poi invece un fallimento (`addSourceBuffer` che rifiuta il mime pur
// dopo che `isTypeSupported` ha detto sì, visto su alcune WebView/Android TV
// con AV1; `sourceopen` mai arrivato) va ripulito esplicitamente — altrimenti
// il `<video>` restava agganciato a un blob morto, con una rejection mai
// intercettata né da qui né da chi chiama (vedi il try/catch in
// creaFlussoMse), spinner fisso senza alcun ripiego su <video src>.
async function avviaMse(video, risposta, { mime, rawStart, origine, sorgente, durata }, cb) {
  const ms = new MediaSource();
  const objectUrl = URL.createObjectURL(ms);
  video.src = objectUrl;
  video.load();
  try {
    await attendiSourceOpen(ms);
    const sb = ms.addSourceBuffer(mime);
    // SINCRONIA AUDIO/VIDEO. Con la timeline "sorgente" (vedi creaFlussoMse)
    // ogni campione porta il suo tempo vero, e "segments" lo rispetta: le due
    // tracce si allineano per costruzione, qualunque sia il punto in cui
    // ciascuna parte (il video dal keyframe, anche secondi prima; l'audio dal
    // secondo chiesto). NON "sequence": lì il browser ignora i tempi dei
    // campioni, mette il primo a 0, e a ogni discontinuità di una traccia la
    // riaccoda in fondo al gruppo — cioè la sposta rispetto all'altra. Resta
    // "sequence" solo con un server vecchio, la cui timeline relativa è stata
    // pensata così.
    sb.mode = sorgente ? "segments" : "sequence";
    // Durata reale della timeline: da `origine` (0 con la timeline sorgente,
    // il keyframe dove ffmpeg è atterrato con quella relativa), non da
    // `rawStart` — sennò gli ultimi secondi veri arriverebbero oltre la
    // durata dichiarata al MediaSource.
    if (durata > origine) { try { ms.duration = durata - origine; } catch { /* solo cosmetico */ } }
    // Salto preciso: in sola copia ffmpeg può partire solo da un inizio di
    // segmento DASH <= il secondo chiesto (misurato: fino a ~6s prima), e il
    // playhead salta da sé al secondo chiesto dentro il buffer MSE, che è
    // cercabile. Impostato a readyState 0 vale come posizione di partenza
    // (spec HTML). Con la timeline sorgente è semplicemente `rawStart`.
    if (rawStart - origine > 0.05) video.currentTime = rawStart - origine;
    const chiuso = { current: false };
    const reader = risposta.body.getReader();
    pompa(reader, sb, video, chiuso, { ...cb, onBufferChange: () => { partenzaNelBuffer(video, sb); cb.onBufferChange(); } });
    return {
      offset: origine,
      finalizza: () => { try { if (ms.readyState === "open") ms.endOfStream(); } catch { /* già chiuso */ } },
      chiudi: () => {
        chiuso.current = true;
        // reader.cancel() ritorna una Promise: un `try/catch` non intercetta
        // un suo rifiuto asincrono (solo un'eccezione sincrona, che qui non
        // può capitare), serve `.catch()`.
        reader.cancel().catch(() => {});
        URL.revokeObjectURL(objectUrl);
      },
    };
  } catch (e) { pulisciMse(objectUrl, risposta); throw e; }
}

// `url` deve già chiedere `tempi=sorgente` (lo aggiunge useStreamSource.js).
// `rawStart` è il secondo grezzo richiesto, dove il playhead salta dentro il
// buffer (vedi avviaMse). La timeline (`offset`, cioè barra = `offset +
// currentTime`) parte da `origine`: 0 con la timeline sorgente, altrimenti il
// vero punto di atterraggio dell'header `X-Mux-Start`.
//
// `ancoraValido()` (opzionale): controllata SUBITO PRIMA di toccare `video`
// (chiamata sincrona, senza `await` in mezzo — così nessun'altra apertura può
// intromettersi fra il controllo e la scrittura). Senza, una `apriStream()`
// superata da una più recente mentre aspettava il fetch (che può durare a
// lungo: rete lenta, probe del keyframe su un salto) scriveva comunque
// `video.src`/`video.load()` PRIMA di accorgersi di essere stata scavalcata
// — il controllo di `useStreamSource.js` arrivava troppo tardi, a mutazione
// già avvenuta, e lasciava il `<video>` agganciato a un blob poi revocato
// dalla propria `chiudi()`: riproduzione bloccata in silenzio, verificato dal
// vivo (`currentTime` fermo, nessun errore). Ritorna `null` — SENZA aver
// toccato `video` — anche in quel caso, non solo se il browser non supporta
// MediaSource, il codec dichiarato dal server (header `X-Mux-Codecs`, vedi
// streaming.py), se il fetch fallisce, o se avviaMse() fallisce DOPO aver già
// toccato `video` (`addSourceBuffer` che rifiuta un mime dichiarato
// supportato, `sourceopen` mai arrivato): il try/catch sotto intercetta
// quella rejection, che altrimenti non arrivava a nessuno — né qui né in
// useStreamSource.js/index.jsx, che non hanno mai avuto un `.catch()` — ed è
// il segnale per chi chiama di usare il ripiego <video src>, che resta
// l'unico a decidere src/load()/velocità quando davvero serve (vedi
// useStreamSource.js).
export async function creaFlussoMse(video, url, { rawStart = 0, durata, onBuffer, onEnd, onError, ancoraValido } = {}) {
  if (typeof MediaSource === "undefined") return null;
  const risposta = await fetch(url).catch(() => null);
  if (!risposta?.ok || !risposta.body) return null;
  const codecs = risposta.headers.get("X-Mux-Codecs");
  // Timeline "sorgente": il server ha onorato `tempi=sorgente` (vedi
  // mux_stream in streaming.py) e ogni campione porta il suo tempo vero nel
  // video originale — l'origine è 0 e la posizione è `currentTime`. Senza
  // l'header (server vecchio con un APK nuovo) la timeline è quella relativa
  // di prima, che parte dal keyframe di X-Mux-Start.
  const sorgente = risposta.headers.get("X-Mux-Timeline") === "sorgente";
  const origine = sorgente ? 0 : parseFloat(risposta.headers.get("X-Mux-Start")) || rawStart;
  const mime = codecs ? `video/mp4; codecs="${codecs}"` : "";
  const viaLibera = mime && MediaSource.isTypeSupported(mime) && (!ancoraValido || ancoraValido());
  if (!viaLibera) { risposta.body.cancel().catch(() => {}); return null; }
  try {
    return await avviaMse(video, risposta, { mime, rawStart, origine, sorgente, durata }, {
      onBufferChange: () => onBuffer?.(),
      // `origine` passata anche qui: chi chiama calcola se il flusso è
      // finito per davvero confrontando la fine del buffer con la durata
      // reale della timeline (durata - origine), non con quella apparente.
      onEnd: t => onEnd?.(t, origine),
      onError: e => onError?.(e),
    });
  } catch { return null; }
}
