// useSponsorBlock.js — salto automatico dei segmenti SponsorBlock.
//
// Il salto usa `seekTo` del player così com'è: dentro al buffer MSE sposta
// solo `currentTime`, altrimenti riapre il flusso con `start` (vedi
// VideoPlayer/index.jsx). Il difficile è NON saltare due volte, né saltare
// per errore dopo un salto dell'utente. Due trappole, entrambe reali:
//
//  - Riaprire il flusso non porta subito la posizione dove si è chiesto: fra
//    la riapertura e i primi dati `load()` riporta `currentTime` a 0 e il
//    player può mostrare un `timeupdate` a 0. Con un'intro a [0, 30) da
//    saltare, quel valore di passaggio farebbe scattare un salto a 30 — dopo
//    un salto dell'utente a 5:00, il video finirebbe a 0:30. Per questo si
//    valuta solo a elemento pronto (`pronto` sotto): dati alla posizione
//    corrente (readyState, che dopo `load()` torna a 0), niente seek in corso.
//  - Fra la chiamata a `seekTo` e la riapertura vera, il vecchio flusso
//    continua a scorrere dentro il segmento: senza un "salto in corso"
//    (`inCorsoRef`) lo stesso segmento chiederebbe una seconda riapertura.
//    Il salto si considera concluso quando la posizione arriva a destinazione
//    (meno 1s, e sul ripiego <video src> si atterra anche oltre: la barra
//    mostra `start + currentTime` da un keyframe precedente), oppure dopo
//    `ATTESA_MAX_MS` — e allora quel segmento non si risalta più, per non
//    entrare in un ciclo se l'atterraggio non torna mai (vedi segmentoIn in
//    sponsorBlock.js per l'altra metà della guardia contro i cicli).
//
// Se /api/sponsorblock non risponde, `segmenti` resta vuoto e il player non
// se ne accorge nemmeno: non aspetta questa risposta per partire.
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { api } from "../../api";
import { usePrefs } from "../../hooks/usePrefs";
import { azioniSponsor, fineUtile, segmentoIn } from "./sponsorBlock";

const ATTESA_MAX_MS = 15000;
// Stessa identità a ogni render: è fra le dipendenze dell'effetto del salto.
const NESSUNO = [];

// Segmenti del video corrente. Quelli di un video precedente non vengono mai
// restituiti (confronto su `videoId`), nemmeno per il render prima che
// l'effetto riparta. Errore o timeout: lista vuota, senza avvisi.
function useSegmenti(videoId, attivo) {
  const [dati, setDati] = useState({ videoId: null, segmenti: NESSUNO });
  useEffect(() => {
    if (!attivo || !videoId) return undefined;
    let vivo = true;
    api.sponsorSegments(videoId)
      .then(r => { if (vivo) setDati({ videoId, segmenti: r.segments?.length ? r.segments : NESSUNO }); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [videoId, attivo]);
  return attivo && dati.videoId === videoId ? dati.segmenti : NESSUNO;
}

// La posizione mostrata è quella vera solo con i dati al punto corrente
// (readyState >= HAVE_CURRENT_DATA) e nessun seek in corso: vedi la prima
// trappola in cima al file.
function pronto(video) {
  return !!video && !video.paused && !video.seeking && video.readyState >= 2;
}

// Vero se non c'è un salto in attesa di atterrare (o se è appena atterrato /
// scaduto, e in quel caso lo chiude). Chiamata solo a elemento `pronto`.
function saltoConcluso(inCorsoRef, esclusi, position) {
  const s = inCorsoRef.current;
  if (!s) return true;
  const atterrato = position >= s.target - 1;
  if (!atterrato && Date.now() - s.dal < ATTESA_MAX_MS) return false;
  if (!atterrato) esclusi.add(s.seg.uuid);
  inCorsoRef.current = null;
  return true;
}

function useSaltoAutomatico({ videoRef, videoId, segmenti, azioni, position, duration, seekTo }) {
  const inCorsoRef = useRef(null);
  const esclusiRef = useRef(new Set());
  const [avviso, setAvviso] = useState(null);
  useEffect(() => { inCorsoRef.current = null; esclusiRef.current = new Set(); setAvviso(null); }, [videoId]);
  // `target`: dove si considera arrivati (fineUtile per un salto in avanti,
  // l'inizio del segmento per "Annulla").
  const vaiA = useCallback((seg, t, target) => {
    inCorsoRef.current = { seg, target, dal: Date.now() };
    seekTo(t);
  }, [seekTo]);
  useEffect(() => {
    if (!pronto(videoRef.current) || !saltoConcluso(inCorsoRef, esclusiRef.current, position)) return;
    const seg = segmentoIn(segmenti, { azioni, azione: "salta", t: position, duration, esclusi: esclusiRef.current });
    if (!seg) return;
    vaiA(seg, seg.end, fineUtile(seg, duration));
    setAvviso({ seg, n: Date.now() });
  }, [position, segmenti, azioni]); // eslint-disable-line react-hooks/exhaustive-deps
  // "Annulla": si torna all'inizio del segmento e quello, per questo video,
  // non si salta più — l'utente ha detto che lo vuole guardare.
  const annulla = useCallback(seg => {
    esclusiRef.current.add(seg.uuid);
    setAvviso(null);
    vaiA(seg, seg.start, seg.start);
  }, [vaiA]);
  return { avviso, vaiA, annulla, chiudiAvviso: useCallback(() => setAvviso(null), []) };
}

/**
 * Segmenti del video, salto automatico delle categorie "salta" e segmento
 * "mostra" in cui si trova ora il playhead (per il pulsante "Salta" a mano).
 * Un solo argomento-oggetto: sono sei valori del player (norma: max 5).
 */
export function useSponsorBlock(ctx) {
  const { prefs } = usePrefs();
  const azioni = useMemo(() => azioniSponsor(prefs), [prefs]);
  const segmenti = useSegmenti(ctx.videoId, !!azioni);
  // Nessun salto (né automatico né a mano) finché /api/watch non ha dato la
  // durata: senza, il MediaSource del flusso riaperto non ha `duration`, il
  // `currentTime` iniziale chiesto viene schiacciato e il playhead finisce
  // all'inizio del buffer, cioè sul keyframe — misurato: salto a 17 atterrato
  // a 11.2, di nuovo dentro il segmento. La barra non permette salti prima
  // della durata, quindi il player non aveva mai incontrato il caso; un'intro
  // a 0 scorre per il tempo della risposta di /api/watch, poi si salta.
  const azioniOra = ctx.duration > 0 ? azioni : null;
  const salto = useSaltoAutomatico({ ...ctx, segmenti, azioni: azioniOra });
  const daMostrare = segmentoIn(segmenti, { azioni: azioniOra, azione: "mostra", t: ctx.position, duration: ctx.duration });
  const { vaiA } = salto;
  const saltaOra = useCallback(seg => vaiA(seg, seg.end, fineUtile(seg, ctx.duration)), [vaiA, ctx.duration]);
  return { segmenti, azioni, daMostrare, saltaOra, avviso: salto.avviso, annulla: salto.annulla, chiudiAvviso: salto.chiudiAvviso };
}
