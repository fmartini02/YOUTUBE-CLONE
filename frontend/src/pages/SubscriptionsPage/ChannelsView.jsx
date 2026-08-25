import SubscribeButton from "../../components/SubscribeButton";

function ChannelCardAvatar({ ch }) {
  if (ch.thumbnail) {
    return <img src={ch.thumbnail} alt={ch.name} referrerPolicy="no-referrer" style={{ width: 64, height: 64, borderRadius: "50%", marginBottom: 8, objectFit: "cover" }} />;
  }
  return (
    <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--bg3)", margin: "0 auto 8px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>
      {(ch.name || "?")[0]}
    </div>
  );
}

function ChannelCard({ ch, navigate, onNotice, onChange }) {
  return (
    <div
      style={{ background: "var(--bg2)", borderRadius: 12, padding: 16, cursor: "pointer", textAlign: "center", transition: "background 0.2s" }}
      onClick={() => navigate("channel", { channelId: ch.id, channelName: ch.name })}
      onMouseEnter={e => e.currentTarget.style.background = "var(--bg3)"}
      onMouseLeave={e => e.currentTarget.style.background = "var(--bg2)"}
    >
      <ChannelCardAvatar ch={ch} />
      <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ch.name}</div>
      <div style={{ marginTop: 10 }}>
        {/* Annullata l'iscrizione, la scheda sparisce subito: insieme se ne
            vanno anche i video di quel canale già caricati nel feed (il
            server ha ripulito la sua cache, la lista già in pagina no). */}
        <SubscribeButton channelId={ch.id} channelName={ch.name} thumbnail={ch.thumbnail} onNotice={onNotice} onChange={onChange} small />
      </div>
    </div>
  );
}

export default function ChannelsView({ subs, navigate, addToast, setSubs, setFeed, onSubsChange }) {
  const onChange = (iscritto, id) => {
    if (!iscritto) {
      setSubs(list => list.filter(c => c.id !== id));
      setFeed(f => f.filter(v => v.channel_id !== id));
    }
    onSubsChange?.();
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
      {subs.map(ch => <ChannelCard key={ch.id} ch={ch} navigate={navigate} onNotice={addToast} onChange={onChange} />)}
    </div>
  );
}
