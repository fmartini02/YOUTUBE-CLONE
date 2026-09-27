// codecDevice.js — quale codec video decodifica bene QUESTO dispositivo.
//
// Perché serve: il "migliore" per yt-dlp è quasi sempre l'AV1, e su un
// dispositivo senza decoder AV1 hardware (la maggior parte dei telefoni non
// recentissimi, molte TV, questo PC di sviluppo) va in software: un video a
// 60 fps si bloccava ogni pochi secondi con il buffer pieno — misurato su
// "INSIDE a Nuclear Reactor Core" (AV1 2160p60: 44% di fotogrammi persi, un
// blocco ogni ~4s con 20-60s già scaricati). Lo stesso video esiste quasi
// sempre anche in VP9 e H.264, che molti più chip decodificano in hardware.
//
// Il test gira UNA volta (all'avvio dell'app, da main.jsx) e il risultato
// resta nel localStorage: separato per dispositivo e per app, quindi l'APK sul
// telefono e il browser sul PC hanno ognuno i propri tre booleani. Si rifà
// solo a mano (Impostazioni → "Ripeti il test") o se il salvataggio sparisce.

import { qualityForScreen } from "../components/VideoPlayer/videoPlayerHelpers";

const CHIAVE = "ytproxy.codec";
const VERSIONE = 1;

// Dal più efficiente al meno: a parità di qualità l'AV1 pesa meno del VP9,
// che pesa meno dell'H.264. Per ogni altezza, la stringa che YouTube dichiara
// a 60 fps (quella che arriverà nell'header X-Mux-Codecs): il livello conta,
// perché su Android un decoder che regge il 4K a 30 fps può rifiutare il
// livello del 4K60 anche se il test è a 1080p. L'H.264 su YouTube si ferma al
// 1080p: sopra si prova quello, il flusso che il server manderebbe davvero.
export const CODEC_ORDINE = [
  { id: "av1", nome: "AV1", stringhe: { 2160: "av01.0.13M.08", 1440: "av01.0.12M.08", 1080: "av01.0.09M.08", 720: "av01.0.08M.08", 480: "av01.0.04M.08", 360: "av01.0.01M.08" } },
  { id: "vp9", nome: "VP9", stringhe: { 2160: "vp09.00.51.08", 1440: "vp09.00.50.08", 1080: "vp09.00.41.08", 720: "vp09.00.40.08", 480: "vp09.00.30.08", 360: "vp09.00.21.08" } },
  { id: "h264", nome: "H.264", stringhe: { 1080: "avc1.64002a", 720: "avc1.640020", 480: "avc1.4d401f", 360: "avc1.4d401e" } },
];

// Bitrate tipico di YouTube a 60 fps per altezza: `decodingInfo` lo vuole, e
// uno troppo basso farebbe sembrare facile un flusso che non lo è.
const BITRATE = { 2160: 20e6, 1440: 10e6, 1080: 5e6, 720: 2.5e6, 480: 1.2e6, 360: 0.7e6 };

/** Risultato salvato ({ av1, vp9, h264, altezza, criterio, data }) o null. */
export function leggiCodec() {
  try {
    const dati = JSON.parse(localStorage.getItem(CHIAVE) || "null");
    return dati && dati.versione === VERSIONE ? dati : null;
  } catch {
    return null;
  }
}

/**
 * Codec da chiedere a /api/mux: il primo acceso nell'ordine AV1 → VP9 → H.264.
 * Vuoto se il test non c'è (ancora in corso al primo avvio, o browser senza
 * `mediaCapabilities`) o se nessun codec è acceso: il server sceglie da sé,
 * come prima di questo test.
 */
export function codecScelto() {
  const dati = leggiCodec();
  return (dati && CODEC_ORDINE.find(c => dati[c.id])?.id) || "";
}

// Chiede al browser come decodificherebbe `codec` a `altezzaSchermo` (o al
// suo gradino più alto, per l'H.264) e 60 fps.
async function prova(codec, altezzaSchermo) {
  const altezza = Math.min(altezzaSchermo, Math.max(...Object.keys(codec.stringhe).map(Number)));
  const stringa = codec.stringhe[altezza] || codec.stringhe[1080];
  const video = {
    contentType: `video/mp4; codecs="${stringa}"`, width: Math.round(altezza * 16 / 9), height: altezza,
    bitrate: BITRATE[altezza] || 5e6, framerate: 60,
  };
  try {
    return await navigator.mediaCapabilities.decodingInfo({ type: "media-source", video });
  } catch {
    return { supported: false, smooth: false, powerEfficient: false };
  }
}

/**
 * Esegue il test (se `forza`, anche se c'è già un risultato) e lo salva.
 *
 * Acceso = decodificato in HARDWARE (`powerEfficient`): è quello che distingue
 * il telefono che regge l'AV1 da quello che lo fa in software. Se però nessun
 * codec è in hardware (Chrome su Linux non usa la GPU per i video, e lì tutti
 * e tre rispondono `powerEfficient: false`) si ripiega su `smooth`, altrimenti
 * quel dispositivo resterebbe con tre booleani spenti. L'altezza provata è
 * quella che "adatta allo schermo" chiederebbe, a 60 fps: il caso più pesante
 * che il dispositivo riceve davvero.
 */
export async function rilevaCodec(forza = false) {
  const salvato = leggiCodec();
  if (salvato && !forza) return salvato;
  if (typeof navigator === "undefined" || !navigator.mediaCapabilities) return null;
  const altezza = Number(qualityForScreen("best", true)) || 1080;
  const esiti = await Promise.all(CODEC_ORDINE.map(c => prova(c, altezza)));
  const hardware = esiti.some(e => e.supported && e.powerEfficient);
  const criterio = hardware ? "hardware" : "fluido";
  const dati = { versione: VERSIONE, altezza, criterio, data: new Date().toISOString() };
  CODEC_ORDINE.forEach((c, i) => {
    dati[c.id] = Boolean(esiti[i].supported && (hardware ? esiti[i].powerEfficient : esiti[i].smooth));
  });
  // Storage bloccato (finestra privata): niente salvataggio, e codecScelto()
  // resta vuoto — decide il server, come prima del test.
  try { localStorage.setItem(CHIAVE, JSON.stringify(dati)); } catch { /* vedi sopra */ }
  return dati;
}
