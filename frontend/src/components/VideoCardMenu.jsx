import { useState, useEffect, useRef } from "react";
import { salvaPerDopo } from "../hooks/useWatchLater";

/**
 * L'evento viene dal menu ⋮ di una card? Come daLinkCanale (ChannelLink.jsx):
 * la card apre il video al click, e col dito lo stopPropagation del menu può
 * non bastare — il tocco arriverebbe alla card e partirebbe il video.
 */
export function daMenuCard(e) {
  return !!e.target?.closest?.(".card-menu");
}

// Chiude il menu toccando fuori. `pointerdown` e non `click`: il click può non
// arrivare col dito (vedi ChannelLink), e il menu resterebbe aperto sopra la
// griglia.
function useChiudiFuori(open, setOpen, ref) {
  useEffect(() => {
    if (!open) return;
    const fuori = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", fuori);
    return () => document.removeEventListener("pointerdown", fuori);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
}

function VociMenu({ esito, onSalva }) {
  return (
    <div className="card-menu-list" role="menu">
      <button role="menuitem" className="card-menu-item" onClick={onSalva} disabled={!!esito}>
        <span className="material-symbols-outlined">{esito ? "check" : "watch_later"}</span>
        {esito || "Salva in Guarda più tardi"}
      </button>
    </div>
  );
}

/**
 * Il ⋮ accanto al titolo di una card, con le azioni sul video. Oggi una sola,
 * "Salva in Guarda più tardi"; l'esito si legge al posto della voce (le card
 * non hanno un toast loro: stanno in pagine diverse, ognuna col suo).
 */
export default function VideoCardMenu({ video }) {
  const [open, setOpen] = useState(false);
  const [esito, setEsito] = useState("");
  const ref = useRef(null);
  useChiudiFuori(open, setOpen, ref);

  const salva = async () => {
    await salvaPerDopo(video, setEsito);
    setTimeout(() => { setOpen(false); setEsito(""); }, 1200);
  };

  return (
    <div className="card-menu" ref={ref} onClick={e => e.stopPropagation()}>
      <button className="card-menu-btn" title="Altre azioni" aria-label="Altre azioni" aria-expanded={open}
        onClick={() => { setEsito(""); setOpen(o => !o); }}>
        <span className="material-symbols-outlined">more_vert</span>
      </button>
      {open && <VociMenu esito={esito} onSalva={salva} />}
    </div>
  );
}
