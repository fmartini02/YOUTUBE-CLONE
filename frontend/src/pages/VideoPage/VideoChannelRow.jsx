import { proxyImg } from "../../api";
import ChannelLink from "../../components/ChannelLink";
import SubscribeButton from "../../components/SubscribeButton";
import CastButton from "../../components/CastButton";
import LikeButton from "../../components/LikeButton";

function VideoActions({ info, cast, castMedia, addToast, onDownload, videoId, canRate }) {
  return (
    <div className="video-actions">
      <LikeButton videoId={videoId} likes={info.likes} canRate={canRate} onNotice={addToast} />
      {/* L'unico comando Chromecast dell'app. Sempre visibile: quando il cast
          non è disponibile spiega il perché invece di sparire senza spiegazioni. */}
      <CastButton cast={cast} media={castMedia} onNotice={addToast} />
      <button className="action-btn" onClick={() => {
        navigator.clipboard?.writeText(`https://youtube.com/watch?v=${videoId}`);
        addToast("Link copiato!");
      }}>🔗 Condividi</button>
      <button className="action-btn" onClick={onDownload}>⬇ Scarica</button>
    </div>
  );
}

/** Canale a sinistra, azioni a destra sulla stessa riga — come YouTube. */
export default function VideoChannelRow({ info, channelAvatar, navigate, addToast, onSubsChange, cast, castMedia, onDownload, videoId, canRate }) {
  return (
    <div className="video-meta-row">
      <div className="channel-row">
        <ChannelLink channelId={info.channel_id} name={info.channel} navigate={navigate} className="channel-avatar">
          {channelAvatar
            ? <img src={proxyImg(channelAvatar)} alt={info.channel} referrerPolicy="no-referrer" />
            : (info.channel || "?")[0]}
        </ChannelLink>
        <div className="channel-name">
          <ChannelLink channelId={info.channel_id} name={info.channel} navigate={navigate} />
        </div>
        {/* Accanto al nome del canale, come su YouTube: da qui ci si iscrive
            senza passare dalla pagina del canale. */}
        <SubscribeButton channelId={info.channel_id} channelName={info.channel} thumbnail={channelAvatar} onNotice={addToast} onChange={onSubsChange} />
      </div>
      <VideoActions info={info} cast={cast} castMedia={castMedia} addToast={addToast} onDownload={onDownload} videoId={videoId} canRate={canRate} />
    </div>
  );
}
