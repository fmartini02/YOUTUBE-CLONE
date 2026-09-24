import { proxyImg } from "../api";
import ChannelLink, { daLinkCanale } from "./ChannelLink";

/** "▶ Playlist" (o "N video") sulla copertina, dove un video ha la durata. */
export function PlaylistBadge({ count }) {
  return (
    <span className="playlist-badge">
      <span className="material-symbols-outlined">playlist_play</span>
      {count ? `${count} video` : "Playlist"}
    </span>
  );
}

/**
 * Card di una playlist nella griglia (scheda Playlist di un canale): copertina
 * con l'etichetta "playlist" in basso, come su YouTube, e titolo. Porta alla
 * pagina della playlist, non al primo video — da lì c'è "Riproduci tutto".
 * YouTube non dice quanti video ci sono in questa lista, e la card non inventa.
 */
export default function PlaylistCard({ playlist, navigate, showChannel = false }) {
  return (
    <div
      className="video-card playlist-card"
      onClick={e => { if (!daLinkCanale(e)) navigate("playlist", { listId: playlist.id }); }}
    >
      <div className="thumbnail-wrap">
        {playlist.thumbnail && <img src={proxyImg(playlist.thumbnail)} alt={playlist.title} referrerPolicy="no-referrer" />}
        <PlaylistBadge count={playlist.count} />
      </div>
      <div className="video-info">
        <div className="video-meta">
          <div className="video-title">{playlist.title}</div>
          {showChannel && (
            <div className="video-channel">
              <ChannelLink channelId={playlist.channel_id} name={playlist.channel} navigate={navigate} />
            </div>
          )}
          <div className="video-stats">Visualizza la playlist completa</div>
        </div>
      </div>
    </div>
  );
}
