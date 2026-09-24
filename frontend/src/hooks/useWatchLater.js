import { useState, useEffect } from "react";
import { api, errorMessage } from "../api";

/**
 * Accoda un video a "Guarda più tardi" (la coda locale, vedi
 * server/auth/watch_later.py). `onNotice` riceve la frase da mostrare: il
 * server dice se il video c'era già, e ripetere "Salvato" a un secondo tocco
 * farebbe credere che ora ci sia due volte.
 */
export async function salvaPerDopo(video, onNotice) {
  try {
    const d = await api.addWatchLater(video);
    onNotice?.(d.added ? "Salvato in Guarda più tardi" : "È già in Guarda più tardi");
    return true;
  } catch (e) {
    onNotice?.(errorMessage(e, "Non sono riuscito a salvare il video"));
    return false;
  }
}

async function togli(videoId, onNotice) {
  try {
    await api.removeWatchLater(videoId);
    onNotice?.("Tolto da Guarda più tardi");
    return true;
  } catch (e) {
    onNotice?.(errorMessage(e, "Non sono riuscito a togliere il video"));
    return false;
  }
}

/**
 * Pulsante "Salva" della pagina video: sa se il video è già in coda (lo
 * chiede al server a ogni cambio di video) e lo mette o lo toglie.
 * `video` deve avere almeno `id`; titolo, canale e copertina finiscono nella
 * coda così com'è, senza doverli richiedere a YouTube per mostrarla.
 */
export function useWatchLaterToggle(video, onNotice) {
  const [saved, setSaved] = useState(false);
  const id = video?.id;

  useEffect(() => {
    setSaved(false);
    if (!id) return;
    let annullato = false;
    api.watchLaterStatus(id).then(d => { if (!annullato) setSaved(!!d.saved); }).catch(() => {});
    return () => { annullato = true; };
  }, [id]);

  const toggle = async () => {
    if (!id) return;
    const ok = saved ? await togli(id, onNotice) : await salvaPerDopo(video, onNotice);
    if (ok) setSaved(!saved);
  };
  return [saved, toggle];
}
