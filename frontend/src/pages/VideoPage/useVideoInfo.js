import { useState, useEffect } from "react";
import { api } from "../../api";

function saveToHistory(videoId, data) {
  // channel_id e durata servono alla pagina Cronologia: il nome del canale lì
  // è un link, e la durata sta sulla copertina come nelle altre card.
  api.addHistory({
    id: videoId, title: data.title, channel: data.channel,
    channel_id: data.channel_id, duration: data.duration, thumbnail: data.thumbnail,
  }).catch(() => {});
}

/**
 * Metadati del video (/api/watch). Non blocca il player: l'URL del flusso
 * (/api/mux) si costruisce subito da videoId+quality, senza bisogno di
 * sapere nient'altro. Prima erano in serie e il video restava fermo per il
 * tempo di entrambe le richieste sommate.
 *
 * Non dipende da `quality`: nessuno di questi campi cambia con la qualità, e
 * rifare l'estrazione ad ogni cambio azzererebbe `info` — cioè la durata,
 * cioè la barra di avanzamento — per il tempo della richiesta.
 */
export function useVideoInfo(videoId, addToast) {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    if (!videoId) return;
    setInfo(null);
    api.watch(videoId).then(data => {
      setInfo(data);
      saveToHistory(videoId, data);
    }).catch(() => addToast("Errore nel caricamento dei dettagli del video"));
  }, [videoId]); // eslint-disable-line react-hooks/exhaustive-deps

  return info;
}
