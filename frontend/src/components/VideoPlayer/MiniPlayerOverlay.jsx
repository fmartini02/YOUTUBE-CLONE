import { useRef, useLayoutEffect } from "react";
import { leggiPosizione, applicaPosizione } from "./miniPosition";
import { useMiniDrag } from "./useMiniDrag";

// I pulsanti non devono avviare il gesto del contenitore (trascina/espandi).
const fermaGesto = e => e.stopPropagation();

/**
 * Comandi del widget (mini-player): play/pausa, chiudi, barretta di
 * avanzamento; toccare altrove riapre il video a pagina intera, trascinare lo
 * sposta. Sta sopra al <video> come fratello, non attorno: il <video> non deve
 * mai cambiare contenitore (vedi App/AppRoutes.jsx).
 *
 * Play e pausa sono due comandi espliciti, non un "inverti": durante uno
 * stallo di rete il video è davvero in pausa (lo ferma il recupero in
 * index.jsx) mentre l'icona dice "in riproduzione" — un toggle lì, al tocco su
 * "pausa", lo farebbe ripartire dentro un buffer vuoto.
 */
export default function MiniPlayerOverlay({ inRiproduzione, onPlay, onPause, onClose, onExpand, pct }) {
  const ref = useRef(null);
  const gesti = useMiniDrag(onExpand);

  // Prima del paint: niente salto visibile dalla posizione predefinita a quella salvata.
  useLayoutEffect(() => {
    const wrap = ref.current?.closest(".player-wrap");
    if (wrap) applicaPosizione(wrap, leggiPosizione());
  }, []);

  return (
    <div className="mini-overlay" ref={ref} {...gesti} role="button" aria-label="Apri il video">
      <button
        className="mini-btn mini-play" onPointerDown={fermaGesto}
        onClick={inRiproduzione ? onPause : onPlay} aria-label={inRiproduzione ? "Pausa" : "Riproduci"}
      >
        <span className="material-symbols-outlined">{inRiproduzione ? "pause" : "play_arrow"}</span>
      </button>
      <button className="mini-btn mini-close" onPointerDown={fermaGesto} onClick={onClose} aria-label="Chiudi">
        <span className="material-symbols-outlined">close</span>
      </button>
      <div className="mini-progress"><div style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
