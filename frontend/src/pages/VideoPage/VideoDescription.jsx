import { formatCompact, formatViews, formatDate } from "../../api";

/**
 * Pillola di statistica nella card chiusa. Niente icona: le tre voci si
 * distinguono già dall'etichetta sotto al numero, come nell'app YouTube.
 */
function DescChip({ valore, etichetta }) {
  if (!valore) return null;
  return (
    <span className="desc-chip">
      <b>{valore}</b>
      <span>{etichetta}</span>
    </span>
  );
}

/**
 * Descrizione del video, versione chiusa: tre statistiche, due righe di testo
 * e "...altro".
 *
 * Prima questo box si espandeva sul posto, spingendo i commenti in fondo alla
 * pagina; adesso il tocco apre il pannello a comparsa (DescriptionSheet), che
 * ha anche capitoli e trascrizione. `expanded`/`setExpanded` restano gli stessi
 * di prima — cambia solo cosa vogliono dire: non più "il box è alto", ma "il
 * pannello è aperto".
 */
export default function VideoDescription({ info, expanded, setExpanded }) {
  const haQualcosa = info.description || info.views || info.likes;
  if (!haQualcosa) return null;
  return (
    <div
      className={`desc-card${expanded ? " aperta" : ""}`}
      onClick={() => setExpanded(true)}
      role="button"
      tabIndex={0}
      // Solo Invio, non la barra spaziatrice: quella è la scorciatoia "pausa"
      // del player, che ascolta su document — premerla qui avrebbe fermato il
      // video E aperto il pannello.
      onKeyDown={e => { if (e.key === "Enter") setExpanded(true); }}
      title="Apri descrizione, capitoli e trascrizione"
    >
      <div className="desc-card-chips">
        <DescChip valore={formatCompact(info.likes)} etichetta="Mi piace" />
        <DescChip valore={formatCompact(info.views)} etichetta="Visualizzazioni" />
        <DescChip valore={formatDate(info.published)} etichetta="Data" />
      </div>
      {info.description
        ? <div className="desc-card-text">{info.description}</div>
        : <div className="desc-card-text vuota">{formatViews(info.views)}</div>}
      <span className="desc-card-more">...altro</span>
    </div>
  );
}
