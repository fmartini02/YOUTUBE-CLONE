import { useRef, useEffect } from "react";

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
 *
 * Col dito non ci si affida al solo `click`: nella WebView di Android quel
 * click a volte non arriva (il tocco finisce interpretato come inizio di una
 * selezione di testo o di uno scorrimento), e allora il logo sembra morto —
 * oppure, dentro una card, il tocco arriva alla card e parte il video. Quindi
 * il tocco si gestisce con i pointer event, tenendo il click come strada
 * principale: se arriva, annulla il ripiego, così non si naviga due volte.
 */

// Quanto si aspetta il `click` prima di darlo per perso: abbastanza da
// lasciarlo arrivare nel caso normale, poco da non sembrare un ritardo.
const CLICK_FALLBACK_MS = 350;
// Oltre questa distanza il dito stava scorrendo la pagina, non toccando.
const TAP_SLOP_PX = 12;

/**
 * L'evento viene da un link canale?
 *
 * Lo usano i contenitori cliccabili (card, riga dei correlati) per non aprire
 * il video quando il tocco è sul canale: lo stopPropagation del link basta
 * finché il click parte davvero, ma col dito può non partire — e allora la
 * card se lo prendeva come tocco su di sé.
 */
export function daLinkCanale(e) {
  return !!e.target?.closest?.(".channel-link");
}

function onPointerDownTap(e, tapRef) {
  if (e.pointerType === "mouse") return;
  e.stopPropagation();
  tapRef.current.start = { x: e.clientX, y: e.clientY };
}

/** Ripiego per il tocco: se il dito non si è spostato oltre TAP_SLOP_PX, prepara `vai` col ritardo di CLICK_FALLBACK_MS. */
function onPointerUpTap(e, tapRef, vai) {
  if (e.pointerType === "mouse") return;
  e.stopPropagation();
  const start = tapRef.current.start;
  tapRef.current.start = null;
  if (!start) return;
  if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_SLOP_PX) return;
  clearTimeout(tapRef.current.timer);
  tapRef.current.timer = setTimeout(vai, CLICK_FALLBACK_MS);
}

/** Naviga una volta sola: click e ripiego col dito possono scattare entrambi, il secondo va ignorato. */
function vaiUnaVolta(tapRef, navigate, channelId, name) {
  const t = tapRef.current;
  clearTimeout(t.timer);
  if (Date.now() - t.done < 800) return;
  t.done = Date.now();
  navigate("channel", { channelId, channelName: name });
}

export default function ChannelLink({ channelId, name, navigate, className = "", style, title, children }) {
  const contenuto = children ?? name;
  const tapRef = useRef({ start: null, timer: null, done: 0 });

  useEffect(() => () => clearTimeout(tapRef.current.timer), []);

  if (!channelId || !navigate) {
    return <span className={className} style={style}>{contenuto}</span>;
  }

  const vai = () => vaiUnaVolta(tapRef, navigate, channelId, name);

  return (
    <span
      className={`channel-link ${className}`.trim()}
      style={style}
      title={title || `Vai al canale ${name || ""}`.trim()}
      onPointerDown={e => onPointerDownTap(e, tapRef)}
      onPointerUp={e => onPointerUpTap(e, tapRef, vai)}
      onPointerCancel={() => { tapRef.current.start = null; }}
      onClick={e => { e.stopPropagation(); vai(); }}
    >
      {contenuto}
    </span>
  );
}
