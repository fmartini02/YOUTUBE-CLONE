import { useToast } from "../../hooks/useToast";
import { useInfiniteScroll } from "../../hooks/useInfiniteScroll";
import { useChannelData } from "./useChannelData";
import ChannelHeader from "./ChannelHeader";
import ChannelBody from "./ChannelBody";

/**
 * Pagina di un canale: intestazione + scheda "Video" con scroll infinito.
 *
 * `channelName` arriva da chi naviga (la lista iscrizioni ce l'ha già) e serve
 * solo a intestare la pagina durante il caricamento: aprendo l'URL diretto non
 * c'è, e il nome vero arriva comunque dalla risposta del server.
 */
export default function ChannelPage({ channelId, channelName, navigate, onSubsChange }) {
  const data = useChannelData(channelId);
  const { addToast, ToastContainer } = useToast();
  const sentinelRef = useInfiniteScroll({ hasMore: data.hasMore, loading: data.loading || data.loadingMore, onLoadMore: data.loadMore });
  const nome = data.channel?.name || channelName || "Canale";

  return (
    <div>
      <ChannelHeader
        channel={data.channel} channelId={channelId} nome={nome}
        descOpen={data.descOpen} setDescOpen={data.setDescOpen} addToast={addToast} onSubsChange={onSubsChange}
      />
      <ChannelBody
        loading={data.loading} videos={data.videos} emptyReason={data.emptyReason} navigate={navigate}
        avatar={data.channel?.avatar} sentinelRef={sentinelRef} loadingMore={data.loadingMore}
      />
      <ToastContainer />
    </div>
  );
}
