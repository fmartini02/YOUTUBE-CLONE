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
// infinite se il problema persiste. Si azzera ad ogni apertura che NON sia
// la diretta continuazione di un retry (`retryRef.current.viaRetry`) — non
// solo a video/qualità diversi: due tagli prematuri indipendenti su due
// salti diversi dello stesso video condividevano lo stesso tetto, pensato
// per UN singolo problema persistente, non per la somma di episodi slegati.
const MAX_RETRY_FINE_ANTICIPATA = 2;

// Le quattro funzioni di lettura, raggruppate in una sola fabbrica (invece
// di quattro funzioni separate) per restare sotto il tetto di 5 funzioni per
// file insieme ad apriStream() e all'hook. `chiudi` incrementa `genRef` prima
// di chiudere: serve a invalidare anche una apriStream() ancora in volo (es.
// smontaggio del player mentre il fetch non ha ancora risposto), che altrimenti
// non saprebbe di essere stata superata — vedi il commento su `genRef` sotto.
function creaLettori(handleRef, genRef) {
  return {
    tempo: video => (handleRef.current?.offset || 0) + video.currentTime,
    tempoLocale: t => t - (handleRef.current?.offset || 0),
    intervalloBuffer: video => {
      const off = handleRef.current?.offset || 0;
      if (!video.buffered.length) return [off, off];
      return [off + video.buffered.start(0), off + video.buffered.end(video.buffered.length - 1)];
    },
    chiudi: () => { genRef.current++; handleRef.current?.chiudi(); },
  };
}

// Riapertura condivisa fra "fine anticipata" (onEnd) e un errore vero della
// pompa (onError, sotto): oltre `MAX_RETRY_FINE_ANTICIPATA` tentativi si
// rinuncia — `suRinuncia` decide cosa fare (finalizzare come fine vera, o
// solo spegnere lo spinner) — invece di restare in un ciclo di riaperture
// che non risolvono nulla se il problema persiste. Estratta qui solo per
// restare sotto le 25 righe di apriStream(), che già la sfiorava da sola.
function riapriOrinuncia(valido, retryRef, t, onFineAnticipata, suRinuncia) {
  if (!valido) return;   // superato da un'apertura più recente
  if (retryRef.current.tentativi >= MAX_RETRY_FINE_ANTICIPATA) { suRinuncia(); return; }
  retryRef.current.tentativi += 1; retryRef.current.viaRetry = true;
  onFineAnticipata(t);
}

// Apre il flusso: prova MSE, ripiega su <video src> se non va. `handleRef`,
// `retryRef` e `genRef` arrivano dall'hook (lo stato mutabile vive lì):
// questa resta una funzione pura sui ref che riceve, per poter stare fuori
// dall'hook e non farne lievitare il conteggio di righe.
//
// `genRef`: due apriStream() possono sovrapporsi (un salto/cambio qualità
// seguito da un altro prima che il primo fetch risolva) — senza un modo per
// sapere "sono ancora io la più recente", vince chi FINISCE per ultimo, non
// chi è stato CHIAMATO per ultimo, e la chiamata scavalcata continua a girare
// in background (fetch, SourceBuffer, processo ffmpeg lato server) perché
// nessuno la chiude mai esplicitamente. `mia` fissa il numero di questa
// apertura all'inizio; se al termine del fetch `genRef.current` è già
// avanzato (un'apertura più nuova, o uno smontaggio, sono arrivati nel
// frattempo), questa chiamata si tira indietro da sola invece di scrivere su
// `video`/`handleRef`, e chiude subito quello che aveva appena aperto.
async function apriStream(handleRef, retryRef, genRef, video, opt) {
  const { videoId, quality, start, durata, rate, autoplay, muxUrl, onBuffer, onFineAnticipata, onAutoplayFailed } = opt;
  const mia = ++genRef.current;
  handleRef.current?.chiudi();
  const url = muxUrl(videoId, quality, start);
  // Catturato PRIMA di azzerare `viaRetry` sotto: serve a `onBuffer` per
  // sapere se QUESTA apertura è la continuazione di un retry — vedi il
  // commento sopra `onBuffer` qui sotto sul perché serve.
  const eraRetry = retryRef.current.viaRetry; if (!eraRetry) retryRef.current.tentativi = 0;
  retryRef.current.viaRetry = false;

  const mse = await creaFlussoMse(video, url, {
    // Un blocco arrivato con successo su una riapertura nata da un retry
    // dimostra che quel problema è superato: il tetto torna a zero per il
    // prossimo episodio scollegato. Senza, due cadute di rete indipendenti a
    // distanza di mezz'ora condividerebbero lo stesso tetto — pensato per UN
    // problema persistente, non per la somma di episodi slegati (vedi
    // commento sopra MAX_RETRY_FINE_ANTICIPATA) — e la terza in un video
    // lungo smetterebbe di recuperare da sola anche se le prime due si erano
    // risolte da tempo.
    rawStart: start, durata, onBuffer: () => { if (eraRetry) retryRef.current.tentativi = 0; onBuffer?.(); },
    // Controllata da creaFlussoMse subito prima di scrivere `video.src`,
    // sincrona: senza, una chiamata scavalcata durante il fetch scriveva
    // comunque sul <video> prima che il controllo qui sotto se ne accorgesse
    // (verificato dal vivo: riproduzione bloccata in silenzio dopo un salto
    // rapido). Con questa, la scrittura non avviene proprio.
    ancoraValido: () => genRef.current === mia,
    onEnd: (bufferedEnd, keyframeStart) => {
      if (genRef.current !== mia) return;   // superato da un'apertura più recente
      // `durata > 0`, non `!durata ||`: senza metadati (/api/watch non ha
      // ancora risposto, il caso normale nei primi 1-3s di QUALSIASI
      // apertura, non solo un salto) non c'è modo di sapere se il flusso è
      // finito per davvero o si è interrotto prima — trattarlo come "finito"
      // troncava silenziosamente il video su un blip di rete iniziale.
      // `keyframeStart`, non `start`: il contenuto reale va da lì alla fine
      // del video, fino a un GOP più lungo di quanto suggerisca `start`.
      const fineVera = durata > 0 && bufferedEnd >= durata - keyframeStart - 1;
      if (fineVera) { handleRef.current.finalizza?.(); return; }
      riapriOrinuncia(true, retryRef, start + bufferedEnd, onFineAnticipata, () => handleRef.current.finalizza?.());
    },
    // Un fetch o un appendBuffer possono fallire a metà riproduzione (rete che
    // cade, tab in background su Android che sospende la pompa): senza questo
    // la pompa si fermava e basta, il buffer smetteva di crescere e lo
    // spinner restava acceso per sempre, perché nessuno lo sapeva. Stesso
    // trattamento della fine anticipata qui sopra — stesso tetto di tentativi,
    // riapertura dal punto vero letto da `video` (non da uno stato React che
    // in questo momento può essere stantio) — così un errore transitorio si
    // riprende da solo invece di restare fermo in attesa di un tocco.
    onError: () => riapriOrinuncia(genRef.current === mia, retryRef, start + video.currentTime, onFineAnticipata, () => onAutoplayFailed?.()),
  });
  if (genRef.current !== mia) { mse?.chiudi(); return; }   // superato mentre aspettavo il fetch

  handleRef.current = mse || { offset: start, chiudi: () => {} };
  if (!mse) { video.src = url; video.load(); }

  video.defaultPlaybackRate = rate; video.playbackRate = rate;
  // `play()` può rifiutarsi (un load() più recente lo interrompe, o il
  // browser nega l'autoplay): ignorarlo in silenzio come prima lasciava lo
  // spinner acceso per sempre, perché nulla poi chiamava `onPlaying`. Solo se
  // questa è ancora l'apertura più recente: una scavalcata rifiuta sempre
  // (chiusa da `handleRef.current?.chiudi()` sopra), ma quella non è colpa
  // sua e non deve spegnere il buffering della NUOVA apertura in corso.
  if (autoplay) video.play().catch(() => { if (genRef.current === mia) onAutoplayFailed?.(); });
  else video.preload = "auto";
}

export function useStreamSource() {
  const handleRef = useRef(null);
  const retryRef = useRef({ tentativi: 0, viaRetry: false });
  const genRef = useRef(0);
  const apri = useCallback((video, opt) => apriStream(handleRef, retryRef, genRef, video, opt), []);
  const { tempo, tempoLocale, intervalloBuffer, chiudi } = creaLettori(handleRef, genRef);
  return { apri, tempo, tempoLocale, intervalloBuffer, chiudi };
}
