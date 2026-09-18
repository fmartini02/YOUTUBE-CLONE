import { proxyImg } from "../../api";
import ChannelLink from "../../components/ChannelLink";
import SubscribeButton from "../../components/SubscribeButton";
import VideoActions from "./VideoActions";

/** Logo + nome del canale e, accanto, il pulsante "Iscriviti" — come YouTube:
    da qui ci si iscrive senza passare dalla pagina del canale. */
function ChannelSide({ info, channelAvatar, navigate, addToast, onSubsChange }) {
  return (
    <div className="channel-row">
      <ChannelLink channelId={info.channel_id} name={info.channel} navigate={navigate} className="channel-avatar">
        {channelAvatar
          ? <img src={proxyImg(channelAvatar)} alt={info.channel} referrerPolicy="no-referrer" />
          : (info.channel || "?")[0]}
      </ChannelLink>
      <div className="channel-name">
        <ChannelLink channelId={info.channel_id} name={info.channel} navigate={navigate} />
      </div>
      <SubscribeButton channelId={info.channel_id} channelName={info.channel} thumbnail={channelAvatar} onNotice={addToast} onChange={onSubsChange} />
    </div>
  );
}

/** Canale a sinistra, azioni a destra sulla stessa riga — come YouTube. */
export default function VideoChannelRow({ info, channelAvatar, navigate, addToast, onSubsChange, cast, onDownload, videoId, canRate, isCasting }) {
  return (
    <div className="video-meta-row">
      <ChannelSide
        info={info} channelAvatar={channelAvatar} navigate={navigate}
        addToast={addToast} onSubsChange={onSubsChange}
      />
      {/* Il comando Chromecast qui non c'è: sta nella barra del player (vedi
          PlayerButtonsBar). Resta solo la pillola per interrompere una
          trasmissione in corso, quando il player non è montato. */}
      <VideoActions
        info={info} addToast={addToast} onDownload={onDownload} videoId={videoId}
        canRate={canRate} cast={cast} isCasting={isCasting}
      />
    </div>
  );
}
