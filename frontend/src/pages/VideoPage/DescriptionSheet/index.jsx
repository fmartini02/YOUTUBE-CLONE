import { useState, useEffect, useRef } from "react";
import { pushBackHandler, popBackHandler } from "../../../App/backHandlers";
import SheetHeader from "./SheetHeader";
import DescriptionTab from "./DescriptionTab";
import ChaptersTab from "./ChaptersTab";
import TranscriptTab from "./TranscriptTab";

// Una linguetta esiste solo se ha davvero qualcosa dentro: i capitoli li ha
// una minoranza dei video, e la trascrizione dipende dai sottotitoli — una
// scheda vuota da aprire per scoprire che è vuota è peggio di nessuna scheda.
function linguette(info, sottotitoli) {
  const voci = [{ id: "descrizione", label: "Descrizione" }];
  if (info.chapters?.length > 0) voci.push({ id: "capitoli", label: "Capitoli" });
  if (sottotitoli?.subtitleLangs?.length > 0) voci.push({ id: "trascrizione", label: "Trascrizione" });
  return voci;
}

/**
 * Tasto Indietro di Android: chiude il pannello invece di uscire dalla pagina
 * video (vedi App/backHandlers.js).
 *
 * Registrato al montaggio — il pannello si monta solo quando è aperto, quindi
 * montaggio e apertura coincidono — e tolto allo smontaggio. `onClose` passa da
 * un ref e NON dalle dipendenze: arriva come arrow nuova ad ogni render, e
 * metterla fra le dipendenze farebbe un push/pop ad ogni render.
 */
function useChiusuraColTastoIndietro(onClose) {
  const rif = useRef(onClose);
  rif.current = onClose;
  useEffect(() => {
    const gestore = () => { rif.current(); return true; };
    pushBackHandler(gestore);
    return () => popBackHandler(gestore);
  }, []);
}

function CorpoPannello({ tab, info, videoId, ctx }) {
  if (tab === "capitoli") return <ChaptersTab chapters={info.chapters} onSalta={ctx.richiediSeek} />;
  if (tab === "trascrizione") {
    return <TranscriptTab videoId={videoId} sottotitoli={ctx.sottotitoli} onSalta={ctx.richiediSeek} />;
  }
  return <DescriptionTab info={info} canale={ctx.canale} />;
}

/**
 * Pannello a comparsa con descrizione, capitoli e trascrizione.
 *
 * Non è una pagina e non tocca la cronologia (niente route nuova, vedi
 * App/routing.js): sale da sotto e si ferma a 75vh apposta, così il player
 * resta visibile sopra — saltare a un capitolo senza vedere il video spostarsi
 * non direbbe niente a chi guarda. Si chiude col "×", toccando lo sfondo, o
 * col tasto Indietro.
 */
export default function DescriptionSheet({ info, videoId, onClose, richiediSeek, canale, sottotitoli }) {
  const [tab, setTab] = useState("descrizione");
  useChiusuraColTastoIndietro(onClose);

  return (
    <>
      <div className="desc-sheet-backdrop" onClick={onClose} />
      <div className="desc-sheet" role="dialog" aria-label="Descrizione del video">
        <SheetHeader
          titolo={info.title} tabs={linguette(info, sottotitoli)}
          tab={tab} setTab={setTab} onClose={onClose}
        />
        <div className="desc-sheet-body">
          <CorpoPannello
            tab={tab} info={info} videoId={videoId}
            ctx={{ richiediSeek, canale, sottotitoli }}
          />
        </div>
      </div>
    </>
  );
}
