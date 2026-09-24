import { formatCompact, formatDate, proxyImg } from "../../api";
import ChannelLink from "../../components/ChannelLink";

// "183 video • 1,0 Mld visualizzazioni • aggiornata il 17 lug 2026": solo i
// pezzi che YouTube ha dato (la scheda di un canale o la coda locale non
// hanno visualizzazioni né data).
function statistiche(playlist, caricati) {
  const n = playlist.count ?? caricati;
  return [
    n != null ? `${n} video` : "",
    playlist.views ? `${formatCompact(playlist.views)} visualizzazioni` : "",
    playlist.updated ? `aggiornata il ${formatDate(playlist.updated)}` : "",
  ].filter(Boolean).join(" • ");
}

function Copertina({ playlist }) {
  if (!playlist.thumbnail) return <div className="playlist-cover playlist-cover-vuota material-symbols-outlined">playlist_play</div>;
  return (
    <div className="playlist-cover">
      <img src={proxyImg(playlist.thumbnail)} alt="" referrerPolicy="no-referrer" />
    </div>
  );
}

/**
 * Intestazione: copertina, titolo, autore, numeri e "Riproduci tutto" — che
 * apre il primo video DENTRO la playlist (`listId`), così nella pagina video
 * compare il pannello e a fine video si passa al successivo.
 */
export default function PlaylistHeader({ playlist, caricati, primo, navigate }) {
  const autore = playlist.local ? "Solo su questo server, senza account" : null;
  return (
    <div className="playlist-header">
      <Copertina playlist={playlist} />
      <div className="playlist-header-info">
        <h1 className="playlist-header-title">{playlist.title || "Playlist"}</h1>
        <div className="playlist-header-sub">
          {autore || <ChannelLink channelId={playlist.channel_id} name={playlist.channel} navigate={navigate} />}
        </div>
        <div className="playlist-header-sub">{statistiche(playlist, caricati)}</div>
        {playlist.description && <div className="playlist-header-desc">{playlist.description}</div>}
        {primo && (
          <button className="action-btn primary playlist-play-all"
            onClick={() => navigate("video", { videoId: primo.id, listId: playlist.id })}>
            ▶ Riproduci tutto
          </button>
        )}
      </div>
    </div>
  );
}
