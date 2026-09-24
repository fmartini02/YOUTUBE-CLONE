import { proxyImg } from "../../api";
import SubscribeButton from "../../components/SubscribeButton";
import { formatSubscribers } from "../ChannelPage/channelMessages";

// referrerPolicy no-referrer: come in VideoCard, yt3.ggpht.com con il Referer
// di localhost risponde 429 (qui passa comunque dal proxy, ma non costa nulla).
function ChannelLogo({ c }) {
  return (
    <div className="search-thumb search-channel-thumb">
      {c.avatar
        ? <img src={proxyImg(c.avatar)} alt={c.name} referrerPolicy="no-referrer" />
        : <span className="search-channel-initial">{(c.name || "?")[0]}</span>}
    </div>
  );
}

/**
 * Risultato di tipo canale, come su YouTube: logo tondo al posto della
 * miniatura, handle e iscritti, l'inizio della descrizione e il pulsante
 * Iscriviti (che spiega da sé cosa manca se l'account non è collegato).
 * Toccare la card apre la pagina del canale.
 */
export default function ChannelResult({ c, navigate, onNotice }) {
  const apri = () => navigate("channel", { channelId: c.id, channelName: c.name });
  return (
    <div className="search-card" onClick={apri}>
      <ChannelLogo c={c} />
      <div className="search-meta">
        <div className="search-title">{c.name}{c.verified && <span className="search-verified" title="Verificato"> ✓</span>}</div>
        <div className="search-stats">{[c.handle, formatSubscribers(c.subscribers)].filter(Boolean).join(" • ")}</div>
        {c.description && <div className="search-description">{c.description}</div>}
        <div className="search-actions" onClick={e => e.stopPropagation()}>
          <SubscribeButton channelId={c.id} channelName={c.name} thumbnail={c.avatar} onNotice={onNotice} small />
        </div>
      </div>
    </div>
  );
}
