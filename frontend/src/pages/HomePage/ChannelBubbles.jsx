import { proxyImg } from "../../api";
import { useChannelBubbles } from "./useChannelBubbles";

// referrerPolicy no-referrer come per gli altri loghi canale: senza, yt3.ggpht
// risponde 429 con una pagina HTML e Chromium la blocca (vedi VideoCard.jsx).
function Bubble({ channel, onOpen }) {
  return (
    <button className="channel-bubble" onClick={() => onOpen(channel)} title={channel.name}>
      <span className="channel-bubble-avatar">
        {/* niente loading="lazy": nella WebView dell'APK le immagini lazy non
            partono finché lo schermo non è acceso e composto (vedi CLAUDE.md). */}
        {channel.avatar
          ? <img src={proxyImg(channel.avatar)} alt={channel.name} referrerPolicy="no-referrer" />
          : (channel.name || "?")[0]}
      </span>
      {channel.nuovo && <span className="channel-bubble-dot" />}
      <span className="channel-bubble-name">{channel.name}</span>
    </button>
  );
}

/**
 * Riga scorrevole dei canali iscritti in cima alla home, con il pallino sui
 * canali che hanno pubblicato qualcosa che non si è ancora aperto.
 *
 * Senza canali non resta una striscia vuota: il componente sparisce del tutto
 * (è il caso normale senza cookie né OAuth).
 */
export default function ChannelBubbles({ navigate, authStatus }) {
  const { channels, segnaVisto } = useChannelBubbles(authStatus?.authenticated);
  if (!channels.length) return null;

  // Il pallino si spegne qui, non alla pagina canale: quella la raggiunge
  // anche chi arriva da una card, e comunque ci pensa pure lei (useChannelData).
  const apri = c => {
    segnaVisto(c.id);
    navigate("channel", { channelId: c.id, channelName: c.name });
  };

  return (
    <div className="channel-bubbles">
      {channels.map(c => <Bubble key={c.id} channel={c} onOpen={apri} />)}
    </div>
  );
}
