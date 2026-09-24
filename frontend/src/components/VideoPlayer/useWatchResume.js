// useWatchResume.js — "riprendi da dove eri rimasto": il punto da cui aprire
// un video appena aperto e il salvataggio periodico di fin dove è arrivato.
// La decisione di dove riprendere (preferenza, primi secondi, video già
// finito) la prende il server, vedi server/auth/watch_progress.py.
import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../../api";
import { useWatchProgress } from "../../hooks/useWatchProgress";

// Ogni quanto mandare la posizione mentre il video scorre. Pausa, uscita dal
// video e app in background la mandano comunque subito. Il server la scrive
// su disco al massimo ogni 10s (PROGRESS_SAVE_MIN_S), questo è il ritmo della rete.
const SALVA_OGNI_MS = 15000;
// Il flusso aspetta questa risposta prima di aprirsi (vedi useRipresa): è una
// lettura in memoria sul server, di norma pochi millisecondi — ma un server
// lento o irraggiungibile non deve lasciare il video fermo. Scaduto il tempo
// si parte da 0, come prima di questa funzione.
const RIPRESA_TIMEOUT_MS = 2000;

// `durata`: quella salvata in cronologia. Serve al flusso appena aperto, che
// parte prima che /api/watch dia la durata vera: vedi useRipresa.
function chiediRipresa(videoId) {
  const zero = { t: 0, durata: 0 };
  const scaduto = new Promise(ok => setTimeout(() => ok(zero), RIPRESA_TIMEOUT_MS));
  const risposta = api.resumePoint(videoId)
    .then(d => ({ t: Number(d.resume) || 0, durata: Number(d.duration) || 0 }))
    .catch(() => zero);
  return Promise.race([risposta, scaduto]);
}

/**
 * Il secondo da cui aprire `videoId`: `null` finché non si sa, poi
 * `{ videoId, t, durata }` (t = 0 se non c'è niente da riprendere).
 *
 * `durata` va passata al flusso finché /api/watch non risponde: senza, il
 * MediaSource non ha durata (Infinity), il `currentTime` impostato prima dei
 * metadati si perde e il playhead resta a inizio buffer — cioè sul keyframe,
 * misurato 7s prima del punto chiesto (130.01 invece di 137).
 *
 * Dipende SOLO da `videoId`: il passaggio del player da pagina intera a
 * widget (`mini`) non deve mai rileggerla — il player resta montato e il video
 * continua da dov'è (vedi CLAUDE.md, "Mini-player"). `chiesto` scarta in fase
 * di render la risposta di un video precedente: tornando su un video già
 * aperto (A → B → A) la vecchia risposta di A non deve valere per la nuova
 * apertura, che ha una posizione più recente.
 */
export function useRipresa(videoId) {
  const [ripresa, setRipresa] = useState(null);
  const [chiesto, setChiesto] = useState(videoId);
  if (chiesto !== videoId) {
    setChiesto(videoId);
    setRipresa(null);
  }
  useEffect(() => {
    let vivo = true;
    chiediRipresa(videoId).then(r => { if (vivo) setRipresa({ videoId, ...r }); });
    return () => { vivo = false; };
  }, [videoId]);
  return chiesto === videoId && ripresa?.videoId === videoId ? ripresa : null;
}

/**
 * Manda al server fin dove è arrivato il video: ogni SALVA_OGNI_MS mentre
 * scorre, e come salvataggio "finale" (scritto subito su disco) quando va in
 * pausa, quando si passa a un altro video, quando il player si smonta e
 * quando la pagina/app va in background. Aggiorna anche la mappa locale delle
 * barrette (useWatchProgress), così la card del video appena lasciato è già giusta.
 *
 * `pronto` falso finché il flusso non è stato aperto dal punto di ripresa:
 * prima `position` vale 0 e salvarla cancellerebbe proprio la posizione che
 * si sta per riprendere.
 *
 * I valori si leggono da un ref aggiornato da un effect senza dipendenze:
 * React esegue le pulizie di tutti gli effect di un commit prima dei nuovi
 * effect, quindi nella pulizia per un cambio di video il ref contiene ancora
 * id e posizione del video che si sta lasciando.
 */
export function useSalvaProgresso(videoId, position, duration, playing, pronto) {
  const { segnaProgresso } = useWatchProgress();
  const ora = useRef({});
  const ultimo = useRef({ pos: -1, finale: false });
  useEffect(() => { ora.current = { videoId, position, duration, pronto }; });

  const salva = useCallback(finale => {
    const { videoId: id, position: pos, duration: dur, pronto: ok } = ora.current;
    const u = ultimo.current;
    if (!ok || !id) return;
    // Niente di nuovo da dire: salta. Un "finale" passa comunque se l'ultimo
    // invio era periodico, che il server può aver tenuto solo in memoria.
    if (Math.abs(pos - u.pos) < 1 && (!finale || u.finale)) return;
    ultimo.current = { pos, finale };
    segnaProgresso(id, pos, dur);
    api.saveProgress(id, { position: pos, duration: dur || null, final: finale }).catch(() => {});
  }, [segnaProgresso]);

  // Mentre scorre: un invio ogni SALVA_OGNI_MS; alla pausa (o cambio video,
  // o smontaggio) la pulizia manda quello finale.
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => salva(false), SALVA_OGNI_MS);
    return () => { clearInterval(timer); salva(true); };
  }, [playing, videoId, salva]);

  useSalvaAllUscita(videoId, salva, ultimo);
}

// Uscita: pagina nascosta o chiusa (su Android anche l'app mandata in
// background), e il video lasciato — anche se era in pausa, dopo un salto.
// Dichiarato DOPO l'effect periodico di useSalvaProgresso: le pulizie girano
// nell'ordine di dichiarazione, quindi l'azzeramento di `ultimo` qui arriva
// dopo il suo salvataggio finale e lo scarta come doppione, non il contrario.
function useSalvaAllUscita(videoId, salva, ultimo) {
  useEffect(() => {
    const onNascosta = () => { if (document.visibilityState === "hidden") salva(true); };
    const onUscita = () => salva(true);
    document.addEventListener("visibilitychange", onNascosta);
    window.addEventListener("pagehide", onUscita);
    return () => {
      document.removeEventListener("visibilitychange", onNascosta);
      window.removeEventListener("pagehide", onUscita);
      salva(true);
      ultimo.current = { pos: -1, finale: false };
    };
  }, [videoId, salva, ultimo]);
}
