// Funzioni pure di supporto al player: formattazione del tempo, scelta della
// qualità in base allo schermo, e verifica se un punto del flusso è già
// raggiungibile senza riaprirlo. Nessuna dipende da stato React, quindi vivono
// fuori dal componente.

export function formatTime(s) {
  if (!isFinite(s) || s < 0) s = 0;
  s = Math.floor(s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = n => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

// Il tempo `t` (relativo al flusso corrente) è già scaricato? Se sì il salto è
// immediato e non serve riaprire lo stream.
export function isBuffered(video, t) {
  for (let i = 0; i < video.buffered.length; i++) {
    if (t >= video.buffered.start(i) && t <= video.buffered.end(i) - 0.3) return true;
  }
  return false;
}

// Gradini di qualità che YouTube offre, dal più alto. `qualityForScreen` cerca
// qui dentro.
const QUALITY_STEPS = [2160, 1440, 1080, 720, 480];

// "Migliore qualità" (quality === "best") non deve scaricare più di quanto lo
// schermo possa davvero mostrare: su un telefono o un monitor 1080p il 4K
// viene scartato pixel per pixel — stessa immagine, il doppio o il quadruplo
// dei dati e del calore per decodificarlo. Con `fitScreen` attivo (preferenza,
// accesa di default) "best" diventa il gradino più alto che il pannello regge:
// pixel fisici del lato corto dello schermo (il video a schermo intero è alto
// così) per il devicePixelRatio, senza tetto — un pannello che regge il 1440p
// riceve il 1440p. La tolleranza del 5% evita che un 1078 reale scenda a 720.
// Una scelta numerica esplicita dal menu (2160, 1080...) passa comunque intatta.
export function qualityForScreen(quality, fitScreen) {
  if (quality !== "best" || !fitScreen) return quality;
  if (typeof window === "undefined" || !window.screen) return quality;
  const dpr = window.devicePixelRatio || 1;
  const px = Math.min(window.screen.width, window.screen.height) * dpr;
  const step = QUALITY_STEPS.find(h => px >= h * 0.95);
  return step ? String(step) : "360";
}

// Averlo in buffer però non basta: il browser sposta `currentTime` solo dentro
// `seekable`, e sul flusso di /api/mux (niente Content-Length, `Accept-Ranges:
// none`) Chrome dichiara `seekable` = [0,0]. Lì ogni assegnazione veniva
// schiacciata a zero — misurato: `v.currentTime = 7.36` si rilegge `0`, cioè il
// video tornava all'inizio invece di andare avanti. Succedeva a ogni salto
// corto: barra spostata di poco, tasti ← →, doppio tocco sul telefono.
export function isSeekable(video, t) {
  for (let i = 0; i < video.seekable.length; i++) {
    if (t >= video.seekable.start(i) && t <= video.seekable.end(i)) return true;
  }
  return false;
}
