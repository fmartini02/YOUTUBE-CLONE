import { useState, useEffect } from "react";
import { useToast } from "../../hooks/useToast";
import { useInfiniteScroll } from "../../hooks/useInfiniteScroll";
import { useChannelData } from "./useChannelData";
import ChannelHeader from "./ChannelHeader";
import ChannelBody from "./ChannelBody";
import ChannelPlaylists from "./ChannelPlaylists";

const SCHEDE = [["video", "Video"], ["playlist", "Playlist"]];

// Le schede sotto l'intestazione, con lo stile dei filtri della home. Stato
// locale e non nell'URL: la scheda Video resta quella da cui si parte.
function ChannelTabs({ scheda, setScheda }) {
  return (
    <div className="filter-chips">
      {SCHEDE.map(([id, label]) => (
        <button key={id} className={`chip${scheda === id ? " active" : ""}`} onClick={() => setScheda(id)}>{label}</button>
      ))}
    </div>
  );
}

/**
 * Pagina di un canale: intestazione + scheda "Video" con scroll infinito, o
 * la scheda "Playlist".
 *
 * `channelName` arriva da chi naviga (la lista iscrizioni ce l'ha già) e serve
 * solo a intestare la pagina durante il caricamento: aprendo l'URL diretto non
 * c'è, e il nome vero arriva comunque dalla risposta del server.
 */
export default function ChannelPage({ channelId, channelName, navigate, onSubsChange }) {
  const data = useChannelData(channelId);
  const [scheda, setScheda] = useState("video");
  useEffect(() => setScheda("video"), [channelId]);
  const { addToast, ToastContainer } = useToast();
  const sentinelRef = useInfiniteScroll({ hasMore: data.hasMore, loading: data.loading || data.loadingMore, onLoadMore: data.loadMore });
  const nome = data.channel?.name || channelName || "Canale";

  return (
    <div>
      <ChannelHeader
        channel={data.channel} channelId={channelId} nome={nome}
        descOpen={data.descOpen} setDescOpen={data.setDescOpen} addToast={addToast} onSubsChange={onSubsChange}
      />
      <ChannelTabs scheda={scheda} setScheda={setScheda} />
      {scheda === "playlist" ? <ChannelPlaylists channelId={channelId} navigate={navigate} /> : (
        <ChannelBody
          loading={data.loading} videos={data.videos} emptyReason={data.emptyReason} navigate={navigate}
          avatar={data.channel?.avatar} sentinelRef={sentinelRef} loadingMore={data.loadingMore}
        />
      )}
      <ToastContainer />
    </div>
  );
}
