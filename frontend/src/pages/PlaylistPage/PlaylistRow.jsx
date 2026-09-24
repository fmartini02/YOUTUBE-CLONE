import { formatDuration, proxyImg } from "../../api";
import ChannelLink, { daLinkCanale } from "../../components/ChannelLink";

/**
 * Una riga della playlist: numero, copertina, titolo, canale. Stessa
 * impaginazione della cronologia (una lista, non una griglia: in una playlist
 * conta l'ordine). La ✕ c'è solo dove si può togliere un video, cioè nella
 * coda locale "Guarda più tardi" — una playlist di YouTube qui è in sola lettura.
 */
export default function PlaylistRow({ v, indice, onOpen, navigate, onRemove }) {
  return (
    <div className="history-row playlist-row" onClick={e => !daLinkCanale(e) && onOpen(v)}>
      <div className="playlist-index">{indice + 1}</div>
      <div className="history-thumb">
        <img src={proxyImg(v.thumbnail || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`)} alt={v.title} />
        {v.duration ? <span className="duration">{formatDuration(v.duration)}</span> : null}
      </div>
      <div className="history-meta">
        <div className="history-title">{v.title}</div>
        <div className="history-sub">
          {v.channel_id
            ? <ChannelLink channelId={v.channel_id} name={v.channel} navigate={navigate} />
            : <span>{v.channel}</span>}
        </div>
      </div>
      {onRemove && (
        <button className="history-remove" title="Togli da Guarda più tardi" aria-label="Togli da Guarda più tardi"
          onClick={e => { e.stopPropagation(); onRemove(v.id); }}>
          ✕
        </button>
      )}
    </div>
  );
}
