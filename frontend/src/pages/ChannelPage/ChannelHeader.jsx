import SubscribeButton from "../../components/SubscribeButton";
import { formatSubscribers } from "./channelMessages";

// referrerPolicy no-referrer su ogni immagine di yt3: con il Referer di
// localhost quei server rispondono 429 e Chromium blocca la risposta.
function ChannelBanner({ banner }) {
  if (!banner) return null;
  return <img src={banner} alt="" referrerPolicy="no-referrer" style={{ width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 12, marginBottom: 16 }} />;
}

function ChannelAvatar({ avatar, nome }) {
  if (avatar) {
    return <img src={avatar} alt={nome} referrerPolicy="no-referrer" style={{ width: 80, height: 80, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />;
  }
  return (
    <div style={{ width: 80, height: 80, borderRadius: "50%", background: "var(--bg3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, flexShrink: 0 }}>
      {nome[0]}
    </div>
  );
}

function ChannelDescription({ descrizione, descOpen, setDescOpen }) {
  if (!descrizione) return null;
  const style = {
    fontSize: 13, color: "var(--text2)", marginTop: 8, maxWidth: 620, cursor: "pointer", whiteSpace: "pre-wrap",
    ...(descOpen ? {} : { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }),
  };
  return (
    <div onClick={() => setDescOpen(o => !o)} title={descOpen ? "Comprimi" : "Espandi"} style={style}>
      {descrizione}
    </div>
  );
}

function ChannelInfo({ channel, nome, descOpen, setDescOpen }) {
  return (
    <div style={{ minWidth: 0 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>
        {nome}
        {channel?.verified && <span style={{ marginLeft: 6, fontSize: 14, color: "var(--text3)" }} title="Canale verificato">✓</span>}
      </h1>
      <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 4 }}>
        {[channel?.handle, formatSubscribers(channel?.subscribers)].filter(Boolean).join(" • ")}
      </div>
      <ChannelDescription descrizione={(channel?.description || "").trim()} descOpen={descOpen} setDescOpen={setDescOpen} />
    </div>
  );
}

export default function ChannelHeader({ channel, channelId, nome, descOpen, setDescOpen, addToast, onSubsChange }) {
  return (
    <>
      <ChannelBanner banner={channel?.banner} />
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <ChannelAvatar avatar={channel?.avatar} nome={nome} />
        <ChannelInfo channel={channel} nome={nome} descOpen={descOpen} setDescOpen={setDescOpen} />
        {/* A destra dell'intestazione, come su YouTube. marginLeft:auto lo
            spinge in fondo alla riga; se va a capo (schermo stretto) finisce
            sotto, che è comunque il posto giusto. */}
        <div style={{ marginLeft: "auto" }}>
          <SubscribeButton channelId={channelId} channelName={nome} thumbnail={channel?.avatar} onNotice={addToast} onChange={onSubsChange} />
        </div>
      </div>
    </>
  );
}
