import { useState } from "react";
import { useToast } from "../../hooks/useToast";
import { useChannelAvatars } from "../../hooks/useChannelAvatars";
import { useInfiniteScroll } from "../../hooks/useInfiniteScroll";
import { useHomeFeed } from "./useHomeFeed";
import CategoryChips from "./CategoryChips";
import EmptyHome from "./EmptyHome";
import HomeGrid, { SkeletonGrid } from "./HomeGrid";

export default function HomePage({ navigate, authStatus }) {
  const [category, setCategory] = useState("Tutti");
  const feed = useHomeFeed(category);
  const { ToastContainer } = useToast();
  const avatars = useChannelAvatars(feed.videos, authStatus?.authenticated);
  const sentinelRef = useInfiniteScroll({ hasMore: feed.hasMore, loading: feed.loading || feed.loadingMore, onLoadMore: feed.loadMore });

  return (
    <div>
      <CategoryChips category={category} setCategory={setCategory} />
      {feed.feedSource === "youtube-home" && feed.videos.length > 0 && (
        <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 12, marginTop: 8 }}>🎯 La tua home YouTube</div>
      )}
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
