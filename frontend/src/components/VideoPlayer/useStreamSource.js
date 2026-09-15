// useStreamSource.js — punto unico da cui VideoPlayer/index.jsx apre e segue
// il flusso di un video: prova MediaSource (mseStream.js) e ripiega su
// <video src> (il vecchio meccanismo, invariato) se non è disponibile o
// fallisce — per (video, qualità), non per l'intera sessione: il problema
// più comune è un formato/codec raro su QUEL video, non un limite del
// browser, quindi ogni apertura riprova MSE da capo.
//
// Le funzioni ritornate leggono sempre lo stato corrente da un ref (mai
// "stantie"), quindi va bene se la loro identità cambia da un render
// all'altro: l'effect di caricamento in index.jsx le chiama senza doverle
// mettere fra le sue dipendenze, che restano `[videoId, quality, stream,
// fitScreen]` come prima di MSE — solo `apri` è comunque `useCallback` a
// dipendenze vuote, perché è quella che l'effect invoca direttamente.
import { useRef, useCallback } from "react";
import { creaFlussoMse } from "./mseStream";

// Un taglio prematuro (URL googlevideo scaduto dopo una pausa lunghissima,
// vedi apriStream) può ripresentarsi: un tetto evita un ciclo di riaperture
// infinite se il problema persiste, azzerato ad ogni nuovo (video, qualità).
const MAX_RETRY_FINE_ANTICIPATA = 2;

// Le quattro funzioni di lettura, raggruppate in una sola fabbrica (invece
// di quattro funzioni separate) per restare sotto il tetto di 5 funzioni per
// file insieme ad apriStream() e all'hook.
function creaLettori(handleRef) {
  return {
    tempo: video => (handleRef.current?.offset || 0) + video.currentTime,
    tempoLocale: t => t - (handleRef.current?.offset || 0),
    intervalloBuffer: video => {
      const off = handleRef.current?.offset || 0;
      if (!video.buffered.length) return [off, off];
      return [off + video.buffered.start(0), off + video.buffered.end(video.buffered.length - 1)];
    },
    chiudi: () => handleRef.current?.chiudi(),
  };
}

// Apre il flusso: prova MSE, ripiega su <video src> se non va. `handleRef` e
// `retryRef` arrivano dall'hook (lo stato mutabile vive lì): questa resta
// una funzione pura sui ref che riceve, per poter stare fuori dall'hook e
// non farne lievitare il conteggio di righe.
async function apriStream(handleRef, retryRef, video, opt) {
  const { videoId, quality, start, durata, rate, autoplay, muxUrl, onBuffer, onFineAnticipata } = opt;
  handleRef.current?.chiudi();
  const url = muxUrl(videoId, quality, start);
  const chiave = `${videoId}:${quality}`;
  if (retryRef.current.chiave !== chiave) retryRef.current = { chiave, tentativi: 0 };

  const mse = await creaFlussoMse(video, url, {
    rawStart: start, durata, onBuffer,
    onEnd: bufferedEnd => {
      if (handleRef.current?.offset !== start) return;   // superato da un'apertura più recente
      const fineVera = !durata || bufferedEnd >= durata - start - 1;
      if (fineVera || retryRef.current.tentativi >= MAX_RETRY_FINE_ANTICIPATA) { handleRef.current.finalizza?.(); return; }
      retryRef.current.tentativi += 1;
      onFineAnticipata(start + bufferedEnd);
    },
  });
  handleRef.current = mse || { offset: start, chiudi: () => {} };
  if (!mse) { video.src = url; video.load(); }

  video.defaultPlaybackRate = rate;
  video.playbackRate = rate;
  if (autoplay) video.play().catch(() => {});
  else video.preload = "auto";
}

export function useStreamSource() {
  const handleRef = useRef(null);
  const retryRef = useRef({ chiave: "", tentativi: 0 });
  const apri = useCallback((video, opt) => apriStream(handleRef, retryRef, video, opt), []);
  const { tempo, tempoLocale, intervalloBuffer, chiudi } = creaLettori(handleRef);
  return { apri, tempo, tempoLocale, intervalloBuffer, chiudi };
}
