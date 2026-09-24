import { proxyImg } from "../../api";
import ChannelLink, { daLinkCanale } from "../../components/ChannelLink";

// Se il video in copertina è stato rimosso YouTube risponde 404 anche alla
// miniatura (visto davvero): meglio il riquadro grigio dell'icona rotta.
function PlaylistCover({ p }) {
  return (
    <div className="search-thumb">
      {p.thumbnail && <img src={proxyImg(p.thumbnail)} alt={p.title} onError={e => { e.currentTarget.style.visibility = "hidden"; }} />}
      <span className="search-playlist-badge">
        <span className="material-symbols-outlined">playlist_play</span>Playlist
      </span>
    </div>
  );
}

/**
 * Risultato di tipo playlist: copertina con la fascia "Playlist", titolo e
 * canale. Porta alla pagina della playlist (/playlist?list=…), da cui c'è
 * "Riproduci tutto" — come la card della scheda Playlist del canale, non al
 * primo video.
 */
export default function PlaylistResult({ p, navigate }) {
  const apri = () => navigate("playlist", { listId: p.id });
  return (
    <div className="search-card" onClick={e => { if (!daLinkCanale(e)) apri(); }}>
      <PlaylistCover p={p} />
      <div className="search-meta">
        <div className="search-title">{p.title}</div>
        <div className="search-channel">
          <ChannelLink channelId={p.channel_id} name={p.channel} navigate={navigate} />
        </div>
        <div className="search-actions" onClick={e => e.stopPropagation()}>
          <button className="action-btn primary" onClick={apri}>▶ Visualizza la playlist</button>
        </div>
      </div>
    </div>
  );
}
