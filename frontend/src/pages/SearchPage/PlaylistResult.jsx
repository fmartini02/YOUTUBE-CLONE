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
 * canale.
 *
 * Una pagina playlist non c'è ancora (issue #12): per ora la card apre il
 * video che la playlist ha in copertina (`video_id`, ricavato dal server
 * dall'URL della miniatura), che di solito è il primo. Quando la pagina
 * arriverà, basterà cambiare `apri`. Senza `video_id` la card non porta da
 * nessuna parte e lo dice, invece di sembrare rotta.
 */
export default function PlaylistResult({ p, navigate }) {
  const apri = p.video_id ? () => navigate("video", { videoId: p.video_id }) : null;
  return (
    <div
      className={`search-card${apri ? "" : " disabled"}`}
      title={apri ? "Apre il video in copertina della playlist" : "Playlist non apribile"}
      onClick={e => { if (!daLinkCanale(e)) apri?.(); }}
    >
      <PlaylistCover p={p} />
      <div className="search-meta">
        <div className="search-title">{p.title}</div>
        <div className="search-channel">
          <ChannelLink channelId={p.channel_id} name={p.channel} navigate={navigate} />
        </div>
        {apri && (
          <div className="search-actions" onClick={e => e.stopPropagation()}>
            <button className="action-btn primary" onClick={apri}>▶ Guarda</button>
          </div>
        )}
      </div>
    </div>
  );
}
