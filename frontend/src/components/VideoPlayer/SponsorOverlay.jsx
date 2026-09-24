import { useEffect } from "react";
import { categoriaSponsor } from "./sponsorBlock";

// Quanto resta a schermo "Sponsor saltato — Annulla": abbastanza per
// accorgersene e toccare Annulla, non tanto da coprire il video a lungo.
const AVVISO_MS = 6000;

/**
 * Segmenti SponsorBlock colorati sulla barra di avanzamento, dentro
 * `.player-progress-track` (stesse percentuali di buffer e avanzamento). Le
 * categorie "ignora" non si disegnano.
 */
export function SponsorBarSegments({ segmenti, azioni, duration }) {
  if (!azioni || !duration || !segmenti.length) return null;
  return segmenti.filter(s => azioni[s.category] && azioni[s.category] !== "ignora").map(s => {
    const left = Math.min(100, (s.start / duration) * 100);
    const width = Math.max(0.3, Math.min(100 - left, ((s.end - s.start) / duration) * 100));
    return (
      <div key={s.uuid} className="player-progress-sponsor"
        style={{ left: `${left}%`, width: `${width}%`, background: categoriaSponsor(s.category)?.colore }} />
    );
  });
}

/**
 * Avviso dopo un salto automatico ("Sponsor saltato — Annulla") oppure, dentro
 * un segmento "mostra solo", il pulsante per saltarlo a mano. Vive DENTRO il
 * player, non nei toast della pagina: a schermo intero quelli non si vedono.
 * Fratello del <video> come gli altri strati: nel widget e nel PiP lo
 * nasconde il CSS (App.css, "MINI-PLAYER" / "PICTURE-IN-PICTURE").
 */
export default function SponsorOverlay({ avviso, onAnnulla, onChiudi, daMostrare, onSalta }) {
  useEffect(() => {
    if (!avviso) return undefined;
    const t = setTimeout(onChiudi, AVVISO_MS);
    return () => clearTimeout(t);
  }, [avviso, onChiudi]);

  if (avviso) {
    return (
      <div className="sponsor-overlay sponsor-avviso" role="status">
        <span>{categoriaSponsor(avviso.seg.category)?.saltato || "Segmento saltato"}</span>
        <button type="button" className="sponsor-btn" onClick={() => onAnnulla(avviso.seg)}>Annulla</button>
      </div>
    );
  }
  if (!daMostrare) return null;
  return (
    <div className="sponsor-overlay sponsor-salta">
      <button type="button" className="sponsor-btn" onClick={() => onSalta(daMostrare)}>
        Salta: {categoriaSponsor(daMostrare.category)?.nome.toLowerCase()}
        <span className="material-symbols-outlined">skip_next</span>
      </button>
    </div>
  );
}
