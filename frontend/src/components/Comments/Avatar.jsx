import ChannelLink from "../ChannelLink";

/**
 * Avatar di chi ha scritto. Con `channelId` e `navigate` porta al canale
 * dell'autore; la casella di scrittura passa solo l'immagine, quindi lì resta
 * un tondo qualsiasi.
 */
export default function Avatar({ src, name, size = 36, channelId, navigate }) {
  return (
    <ChannelLink
      channelId={channelId}
      name={name}
      navigate={navigate}
      className="channel-avatar"
      style={{ width: size, height: size, fontSize: size / 2.8, flexShrink: 0, overflow: "hidden" }}
    >
      {/* referrerPolicy no-referrer come nelle card: con il Referer di
          localhost yt3.ggpht.com risponde 429 e Chromium blocca la risposta —
          senza, al posto dei loghi si vedeva il testo alternativo. */}
      {src
        ? <img src={src} alt={name || ""} referrerPolicy="no-referrer" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : (name || "?").replace("@", "")[0]}
    </ChannelLink>
  );
}
