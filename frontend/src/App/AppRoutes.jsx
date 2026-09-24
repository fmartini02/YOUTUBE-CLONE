import HomePage from "../pages/HomePage";
import SearchPage from "../pages/SearchPage";
import VideoPage from "../pages/VideoPage";
import SubscriptionsPage from "../pages/SubscriptionsPage";
import ChannelPage from "../pages/ChannelPage";
import SettingsPage from "../pages/SettingsPage";
import HistoryPage from "../pages/HistoryPage";

/**
 * Route "finte" a mano (vedi routing.js): una sola pagina montata alla volta —
 * più, eventualmente, la pagina video ridotta a widget sopra di essa.
 *
 * La pagina video NON sta fra le altre condizioni `page === ...`: resta
 * montata finché c'è un video nel widget (`nav.widget`), che sia a pagina
 * intera o ridotto. Passare da uno stato all'altro cambia solo la prop `mini`,
 * mai la posizione o il tipo dell'elemento — altrimenti React la rimonterebbe,
 * e con lei il player: flusso /api/mux riaperto da capo, autoplay rideciso, la
 * posizione persa. Per lo stesso motivo niente `key` e niente contenitori
 * condizionali attorno.
 */
export default function AppRoutes({ nav }) {
  const { page, pageParams, navigate, authStatus, loadAuthStatus, widget } = nav;
  return (
    <>
      {page === "home"          && <HomePage navigate={navigate} authStatus={authStatus} />}
      {page === "search"        && <SearchPage query={pageParams.query} navigate={navigate} />}
      {page === "subscriptions" && <SubscriptionsPage navigate={navigate} onSubsChange={loadAuthStatus} authStatus={authStatus} />}
      {page === "channel"       && <ChannelPage channelId={pageParams.channelId} channelName={pageParams.channelName} navigate={navigate} onSubsChange={loadAuthStatus} />}
      {page === "settings"      && <SettingsPage navigate={navigate} />}
      {page === "history"       && <HistoryPage navigate={navigate} />}
      {widget && (
        <VideoPage
          videoId={widget} navigate={navigate} authStatus={authStatus} onSubsChange={loadAuthStatus}
          mini={page !== "video"} onExpand={() => navigate("video", { videoId: widget })} onClose={nav.chiudiWidget}
        />
      )}
    </>
  );
}
