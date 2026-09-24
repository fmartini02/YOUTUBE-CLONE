import { useState, useEffect } from "react";
import { api } from "../../api";
import PlaylistCard from "../../components/PlaylistCard";
import { SkeletonGrid } from "./ChannelBody";

/**
 * Scheda "Playlist" di un canale (/api/channel/<id>/playlists): tutte in una
 * richiesta, senza scroll infinito — sono qualche decina al massimo. Si
 * carica solo aprendo la scheda: chi guarda solo i video non paga
 * un'estrazione in più.
 */
function useChannelPlaylists(channelId) {
  const [stato, setStato] = useState({ loading: true, playlists: [], errore: false });
  useEffect(() => {
    let annullato = false;
    setStato({ loading: true, playlists: [], errore: false });
    api.channelPlaylists(channelId)
      .then(d => { if (!annullato) setStato({ loading: false, playlists: d.results || [], errore: false }); })
      .catch(() => { if (!annullato) setStato({ loading: false, playlists: [], errore: true }); });
    return () => { annullato = true; };
  }, [channelId]);
  return stato;
}

export default function ChannelPlaylists({ channelId, navigate }) {
  const { loading, playlists, errore } = useChannelPlaylists(channelId);
  if (loading) return <SkeletonGrid count={8} />;
  if (!playlists.length) {
    return (
      <div style={{ textAlign: "center", padding: 60, color: "var(--text2)" }}>
        {errore ? "Il server non ha risposto. Riprova tra poco." : "Questo canale non ha playlist pubbliche."}
      </div>
    );
  }
  return (
    <div className="video-grid">
      {playlists.map(p => <PlaylistCard key={p.id} playlist={p} navigate={navigate} />)}
    </div>
  );
}
