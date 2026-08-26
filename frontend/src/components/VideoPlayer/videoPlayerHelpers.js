// Funzioni pure di supporto al player: formattazione del tempo e verifica se
// un punto del flusso è già raggiungibile senza riaprirlo. Nessuna dipende da
// stato React, quindi vivono fuori dal componente.

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
