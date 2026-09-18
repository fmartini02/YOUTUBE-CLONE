import { useState } from "react";
import { useToast } from "../../hooks/useToast";
import { useChannelAvatars } from "../../hooks/useChannelAvatars";
import { useInfiniteScroll } from "../../hooks/useInfiniteScroll";
import { useHomeFeed } from "./useHomeFeed";
import CategoryChips from "./CategoryChips";
import ChannelBubbles from "./ChannelBubbles";
import EmptyHome from "./EmptyHome";
import HomeGrid, { SkeletonGrid } from "./HomeGrid";

// La riga "🎯 La tua home YouTube": c'è solo quando i video arrivano davvero
// dalla home dell'account (cookie validi), non dai ripieghi.
function FeedSourceBadge({ feed }) {
  if (feed.feedSource !== "youtube-home" || !feed.videos.length) return null;
  return (
    <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 12, marginTop: 8 }}>🎯 La tua home YouTube</div>
  );
}

export default function HomePage({ navigate, authStatus }) {
  const [category, setCategory] = useState("Tutti");
  const feed = useHomeFeed(category);
  const { ToastContainer } = useToast();
  const avatars = useChannelAvatars(feed.videos, authStatus?.authenticated);
  const sentinelRef = useInfiniteScroll({ hasMore: feed.hasMore, loading: feed.loading || feed.loadingMore, onLoadMore: feed.loadMore });

  return (
    <div>
      {/* Solo sulla home vera: nelle altre categorie sotto si sta guardando
          il risultato di una ricerca, dove i canali iscritti non c'entrano. */}
      {category === "Tutti" && <ChannelBubbles navigate={navigate} authStatus={authStatus} />}
      <CategoryChips category={category} setCategory={setCategory} />
      <FeedSourceBadge feed={feed} />
      {feed.loading ? (
        <SkeletonGrid count={12} />
      ) : feed.videos.length === 0 ? (
        <EmptyHome emptyReason={feed.emptyReason} navigate={navigate} />
      ) : (
        <HomeGrid videos={feed.videos} navigate={navigate} avatars={avatars} sentinelRef={sentinelRef} loadingMore={feed.loadingMore} />
      )}
      <ToastContainer />
    </div>
  );
}
