import HomePage from "../pages/HomePage";
import SearchPage from "../pages/SearchPage";
import VideoPage from "../pages/VideoPage";
import SubscriptionsPage from "../pages/SubscriptionsPage";
import ChannelPage from "../pages/ChannelPage";
import SettingsPage from "../pages/SettingsPage";
import HistoryPage from "../pages/HistoryPage";

/** Route "finte" a mano (vedi routing.js): una sola pagina montata alla volta. */
export default function AppRoutes({ page, pageParams, navigate, authStatus, loadAuthStatus }) {
  return (
    <>
      {page === "home"          && <HomePage navigate={navigate} authStatus={authStatus} />}
      {page === "search"        && <SearchPage query={pageParams.query} navigate={navigate} />}
      {page === "video"         && <VideoPage videoId={pageParams.videoId} navigate={navigate} authStatus={authStatus} onSubsChange={loadAuthStatus} />}
      {page === "subscriptions" && <SubscriptionsPage navigate={navigate} onSubsChange={loadAuthStatus} authStatus={authStatus} />}
      {page === "channel"       && <ChannelPage channelId={pageParams.channelId} channelName={pageParams.channelName} navigate={navigate} onSubsChange={loadAuthStatus} />}
      {page === "settings"      && <SettingsPage navigate={navigate} />}
      {page === "history"       && <HistoryPage navigate={navigate} />}
    </>
  );
}
