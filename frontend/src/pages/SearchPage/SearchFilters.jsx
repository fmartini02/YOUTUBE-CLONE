import { useState } from "react";
import { GRUPPI, soloPerVideo, conOpzione, etichetta } from "./filtri";

// Una colonna del pannello. Le opzioni che non si applicano al tipo scelto
// (durata e data con canali/playlist) restano visibili ma disattivate, come
// su YouTube: sparendo, sembrerebbe che il pannello sia cambiato da solo.
function FilterGroup({ gruppo, filtri, onScegli }) {
  const disattivo = soloPerVideo(gruppo.chiave, filtri);
  const attuale = filtri[gruppo.chiave] || gruppo.predefinito;
  return (
    <div className="search-filter-group">
      <div className="search-filter-title">{gruppo.titolo}</div>
      {gruppo.opzioni.map(([valore, testo]) => (
        <button
          key={valore}
          className={`search-filter-option${attuale === valore ? " active" : ""}`}
          disabled={disattivo}
          title={disattivo ? "Vale solo per i video" : undefined}
          onClick={() => onScegli(gruppo.chiave, valore)}
        >
          {testo}
        </button>
      ))}
    </div>
  );
}

// I filtri attivi restano in vista anche a pannello chiuso: un tocco li toglie.
function ActiveFilters({ filtri, onScegli, onAzzera }) {
  const voci = Object.entries(filtri);
  if (!voci.length) return null;
  return (
    <>
      {voci.map(([chiave, valore]) => (
        <button key={chiave} className="chip active search-filter-chip" title="Togli il filtro" onClick={() => onScegli(chiave, valore)}>
          {etichetta(chiave, valore)}
          <span className="material-symbols-outlined">close</span>
        </button>
      ))}
      {voci.length > 1 && <button className="chip" onClick={onAzzera}>Cancella tutto</button>}
    </>
  );
}

/**
 * Barra "Filtri" della ricerca, come su YouTube: il pulsante apre il pannello
 * con le quattro colonne, i chip mostrano cosa è attivo.
 *
 * Non tiene i filtri: li riceve (vengono dall'URL) e a ogni scelta chiama
 * `onChange` con quelli nuovi, che finiscono nell'URL — così ricaricare,
 * condividere il link e il tasto Indietro li conservano. Il pannello resta
 * aperto dopo una scelta, per poterne combinare più d'una.
 */
export default function SearchFilters({ filtri, onChange }) {
  const [aperto, setAperto] = useState(false);
  const scegli = (chiave, valore) => onChange(conOpzione(filtri, chiave, valore));
  return (
    <div className="search-filters">
      <div className="filter-chips search-filter-bar">
        <button className={`chip search-filter-toggle${aperto ? " open" : ""}`} aria-expanded={aperto} onClick={() => setAperto(a => !a)}>
          <span className="material-symbols-outlined">tune</span>Filtri
        </button>
        <ActiveFilters filtri={filtri} onScegli={scegli} onAzzera={() => onChange({})} />
      </div>
      {aperto && (
        <div className="search-filter-panel">
          {GRUPPI.map(g => <FilterGroup key={g.chiave} gruppo={g} filtri={filtri} onScegli={scegli} />)}
        </div>
      )}
    </div>
  );
}
