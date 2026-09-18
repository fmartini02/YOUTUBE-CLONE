/** Una sola linguetta vuol dire "c'è solo la descrizione": mostrarla da sola
    sarebbe un bottone che non fa niente, quindi la riga sparisce del tutto. */
function SheetTabs({ tabs, tab, setTab }) {
  if (tabs.length < 2) return null;
  return (
    <div className="desc-sheet-tabs" role="tablist">
      {tabs.map(v => (
        <button
          key={v.id}
          className={`desc-tab${tab === v.id ? " attiva" : ""}`}
          onClick={() => setTab(v.id)}
          role="tab"
          aria-selected={tab === v.id}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Intestazione fissa del pannello: titolo del video, "×" per chiudere e le
 * linguette. Sta fuori dalla parte che scorre, così il modo di chiudere resta
 * sotto il pollice anche in fondo a una trascrizione di mille righe.
 */
export default function SheetHeader({ titolo, tabs, tab, setTab, onClose }) {
  return (
    <div className="desc-sheet-head">
      <div className="desc-sheet-title-row">
        <span className="desc-sheet-title">{titolo}</span>
        <button className="desc-sheet-close" onClick={onClose} title="Chiudi" aria-label="Chiudi">
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>
      <SheetTabs tabs={tabs} tab={tab} setTab={setTab} />
    </div>
  );
}
