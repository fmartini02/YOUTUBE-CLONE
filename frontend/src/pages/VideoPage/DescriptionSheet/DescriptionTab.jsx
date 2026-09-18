import { formatCompact, formatDate, proxyImg } from "../../../api";
import ChannelLink from "../../../components/ChannelLink";
import SubscribeButton from "../../../components/SubscribeButton";
import { formatSubscribers } from "../../ChannelPage/channelMessages";

// Gli hashtag che l'autore ha messo nella descrizione. `\p{L}` e non `\w`: in
// italiano ci finiscono lettere accentate (#perché), e `\w` le taglierebbe a
// metà. Restano anche nel testo qui sotto, come su YouTube — queste sono una
// scorciatoia per vederli tutti insieme, non un'estrazione.
function estraiHashtag(descrizione) {
  const trovati = String(descrizione || "").match(/#[\p{L}\p{N}_]+/gu) || [];
  return [...new Set(trovati)].slice(0, 12);
}

/** Mini-card del canale: logo, nome, iscritti e il solito pulsante Iscriviti. */
function CanaleCard({ info, canale }) {
  const { channelAvatar, navigate, addToast, onSubsChange } = canale || {};
  if (!info.channel) return null;
  return (
    <div className="desc-channel">
      <ChannelLink channelId={info.channel_id} name={info.channel} navigate={navigate} className="channel-avatar">
        {channelAvatar
          ? <img src={proxyImg(channelAvatar)} alt={info.channel} referrerPolicy="no-referrer" />
          : (info.channel || "?")[0]}
      </ChannelLink>
      <div className="desc-channel-meta">
        <ChannelLink channelId={info.channel_id} name={info.channel} navigate={navigate} />
        <span className="desc-channel-subs">{formatSubscribers(info.subscribers)}</span>
      </div>
      <SubscribeButton
        channelId={info.channel_id} channelName={info.channel} thumbnail={channelAvatar}
        onNotice={addToast} onChange={onSubsChange} small
      />
    </div>
  );
}

/** Gli stessi numeri delle pillole della card chiusa, qui per esteso. */
function Dettagli({ info }) {
  const voci = [
    ["Data", formatDate(info.published)],
    ["Visualizzazioni", formatCompact(info.views)],
    ["Mi piace", formatCompact(info.likes)],
  ].filter(([, v]) => v);
  if (!voci.length) return null;
  return (
    <div className="desc-details">
      <h4>Dettagli</h4>
      {voci.map(([k, v]) => (
        <div className="desc-detail-row" key={k}><span>{k}</span><b>{v}</b></div>
      ))}
    </div>
  );
}

export default function DescriptionTab({ info, canale }) {
  const tag = estraiHashtag(info.description);
  return (
    <div className="desc-tab-body">
      {tag.length > 0 && (
        <div className="desc-hashtags">
          {tag.map(t => <span className="desc-hashtag" key={t}>{t}</span>)}
        </div>
      )}
      <div className="desc-full-text">{info.description || "Nessuna descrizione."}</div>
      <CanaleCard info={info} canale={canale} />
      <Dettagli info={info} />
    </div>
  );
}
