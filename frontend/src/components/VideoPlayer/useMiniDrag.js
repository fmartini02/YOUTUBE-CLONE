import { useRef } from "react";
import { TAP_SLOP_PX } from "./playerConstants";
import { posizioneDa, applicaPosizione, salvaPosizione } from "./miniPosition";

// Un gesto sul widget è un trascinamento solo oltre TAP_SLOP_PX (la stessa
// soglia dei tocchi sul player): sotto, è un tocco e apre il video a pagina
// intera. Senza soglia, il rilascio dopo uno spostamento anche minimo
// espanderebbe il widget proprio mentre lo si voleva solo spostare.
function sposta(g, e) {
  const dx = e.clientX - g.x;
  const dy = e.clientY - g.y;
  if (!g.moved && Math.hypot(dx, dy) <= TAP_SLOP_PX) return;
  g.moved = true;
  const p = posizioneDa(g.rect, dx, dy);
  if (!p) return;
  g.pos = p;
  applicaPosizione(g.wrap, p);
}

/**
 * Gesti sul widget: trascinare lo sposta, toccare lo espande. Pausa e X
 * fermano il pointerdown (vedi MiniPlayerOverlay), quindi non avviano né
 * l'uno né l'altro. La cattura del puntatore tiene il gesto su questo
 * elemento anche se il dito corre più veloce del widget.
 */
export function useMiniDrag(onExpand) {
  const gesto = useRef(null);
  return {
    onPointerDown(e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const wrap = e.currentTarget.closest(".player-wrap");
      if (!wrap) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      gesto.current = { x: e.clientX, y: e.clientY, rect: wrap.getBoundingClientRect(), wrap, moved: false, pos: null };
    },
    onPointerMove(e) { if (gesto.current) sposta(gesto.current, e); },
    onPointerUp() {
      const g = gesto.current;
      gesto.current = null;
      if (!g) return;
      if (!g.moved) onExpand?.();
      else if (g.pos) salvaPosizione(g.pos);
    },
    onPointerCancel() {
      const g = gesto.current;
      gesto.current = null;
      if (g?.pos) salvaPosizione(g.pos);
    },
  };
}
