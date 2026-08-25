import { useState } from "react";
import { useChannelAvatars } from "../../hooks/useChannelAvatars";
import { useInfiniteScroll } from "../../hooks/useInfiniteScroll";
import { useToast } from "../../hooks/useToast";
import { useSubscriptionsData } from "./useSubscriptionsData";
import SubscriptionsHeader from "./SubscriptionsHeader";
import EmptySubscriptions from "./EmptySubscriptions";
import FeedView from "./FeedView";
import ChannelsView from "./ChannelsView";

export default function SubscriptionsPage({ navigate, onSubsChange, authStatus }) {
  const [view, setView] = useState("feed"); // feed | channels
  const data = useSubscriptionsData();
  const avatars = useChannelAvatars(data.feed, authStatus?.authenticated);
  const { addToast, ToastContainer } = useToast();

  // Disiscrivendosi dall'ultimo canale la scheda "Canali" sparisce: senza
  // questo la pagina resterebbe su una vista che non si può più scegliere.
  const vista = data.subs.length ? view : "feed";
  // hasMore solo nella vista feed: la lista canali non è paginata.
  const sentinelRef = useInfiniteScroll({
    hasMore: data.hasMore && vista === "feed", loading: data.feedLoading || data.loadingMore, onLoadMore: data.loadMore,
  });

  if (data.loading || data.feedLoading) return <div style={{ color: "var(--text2)" }}>Caricamento iscrizioni...</div>;
  // L'elenco dei canali arriva dall'OAuth, il feed dai cookie: due
  // autenticazioni indipendenti. Vuota solo se mancano ENTRAMBE.
  if (data.subs.length === 0 && data.feed.length === 0) return <EmptySubscriptions navigate={navigate} />;

  return (
    <div>
      <SubscriptionsHeader view={view} setView={setView} subsCount={data.subs.length} />
      {vista === "feed" && (
        <FeedView feedLoading={data.feedLoading} feed={data.feed} avatars={avatars} navigate={navigate} sentinelRef={sentinelRef} loadingMore={data.loadingMore} />
      )}
      {vista === "channels" && (
        <ChannelsView subs={data.subs} navigate={navigate} addToast={addToast} setSubs={data.setSubs} setFeed={data.setFeed} onSubsChange={onSubsChange} />
      )}
      <ToastContainer />
    </div>
  );
}
