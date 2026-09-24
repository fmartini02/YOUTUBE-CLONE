import { useEffect } from "react";
import { inviaStatoPip, registraComandiPip } from "../../hooks/pipBridge";

/**
 * Tiene informato il PiP di Android (hooks/pipBridge.js) su questo player: c'è,
 * sta andando, quanto è grande il video (per le proporzioni della finestra).
 *
 * `inRiproduzione` è `playing || rebuffering`: durante uno stallo di rete il
 * recupero mette il video in pausa tecnica (index.jsx) ma ripartirà da solo —
 * con `playing` e basta l'entrata automatica si spegnerebbe a ogni calo di rete
 * e nella finestra comparirebbe "play" su un video che sta per ripartire.
 *
 * Allo smontaggio (widget chiuso, cast iniziato, pagina lasciata) dice "non
 * attivo": da lì uscire dall'app non apre più nessuna finestra.
 */
export function usePipBridge(videoRef, inRiproduzione, altezza, riproduci, pausa) {
  useEffect(() => registraComandiPip({ play: riproduci, pause: pausa }), [riproduci, pausa]);

  useEffect(() => {
    const v = videoRef.current;
    inviaStatoPip({ attivo: true, playing: inRiproduzione, w: v?.videoWidth || 0, h: v?.videoHeight || altezza || 0 });
  }, [inRiproduzione, altezza]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => inviaStatoPip({ attivo: false, playing: false }), []);
}
