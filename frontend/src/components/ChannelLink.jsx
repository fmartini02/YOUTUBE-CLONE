/**
 * Nome (o logo) di un canale che porta alla sua pagina.
 *
 * Senza `channelId` o senza `navigate` non c'è dove andare — capita davvero:
 * il feed home di YouTube a volte non dà l'id del canale, e i commenti presi
 * da yt-dlp nemmeno. In quel caso resta testo normale, invece di un finto link
 * che non fa niente.
 *
 * stopPropagation è obbligatorio: questi nomi stanno quasi sempre dentro
 * elementi già cliccabili (la card del video, la riga dei correlati), e senza
 * fermare l'evento cliccare il canale farebbe partire il video.
 */
export default function ChannelLink({ channelId, name, navigate, className = "", style, title, children }) {
  const contenuto = children ?? name;

  if (!channelId || !navigate) {
    return <span className={className} style={style}>{contenuto}</span>;
  }

  return (
    <span
      className={`channel-link ${className}`.trim()}
      style={style}
      title={title || `Vai al canale ${name || ""}`.trim()}
      onClick={e => {
        e.stopPropagation();
        navigate("channel", { channelId, channelName: name });
      }}
    >
      {contenuto}
    </span>
  );
}
