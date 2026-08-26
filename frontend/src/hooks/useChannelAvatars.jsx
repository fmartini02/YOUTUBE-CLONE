import { useState, useEffect, useRef } from "react";
import { api } from "../api";

/**
 * Chiede in batch i loghi mancanti e aggiorna `chiesti`/`avatars`. Chi non
 * viene risolto torna richiedibile: il server tiene già una cache negativa,
 * quindi non è una richiesta sprecata (risponde senza richiamare YouTube).
 */
function fetchMissingAvatars(ids, chiesti, setAvatars) {
  ids.forEach(id => chiesti.current.add(id));
  let annullato = false;

  api.channelAvatars(ids).then(d => {
    if (annullato) return;
    const risolti = d.avatars || {};
    if (Object.keys(risolti).length) setAvatars(prev => ({ ...prev, ...risolti }));
    ids.forEach(id => { if (!risolti[id]) chiesti.current.delete(id); });
  }).catch(() => {
    if (!annullato) ids.forEach(id => chiesti.current.delete(id));
  });

  return () => { annullato = true; };
}

/**
 * Risolve i loghi canale per una lista di video. Alcuni video li hanno già
 * inline (feed iscrizioni, gratis dalla sync abbonamenti); per gli altri
 * (ricerca, home, correlati) li richiede in batch a /api/channel-avatars.
 *
 * `authKey` (di solito authStatus?.authenticated) serve a ritentare: i loghi
 * arrivano dalla Data API, che senza account collegato non risponde affatto.
 * Prima gli id venivano segnati come "già chiesti" PRIMA della richiesta e non
 * si ripuliva niente, quindi tutti i canali visti prima del login restavano
 * senza logo per tutta la sessione. Ora un id torna richiedibile se la
 * richiesta fallisce o non lo risolve, e cambiando account si riparte da zero.
 */
export function useChannelAvatars(videos, authKey) {
  const [avatars, setAvatars] = useState({});
  // Id per cui c'è una richiesta in corso o già risolta: evita di chiedere
  // due volte lo stesso canale mentre si scorre.
  const chiesti = useRef(new Set());

  useEffect(() => {
    chiesti.current = new Set();
    setAvatars({});
  }, [authKey]);

  useEffect(() => {
    const ids = [...new Set(
      videos.filter(v => !v.avatar && v.channel_id).map(v => v.channel_id)
    )].filter(id => !chiesti.current.has(id));
    if (!ids.length) return;
    return fetchMissingAvatars(ids, chiesti, setAvatars);
  }, [videos, authKey]);

  return avatars;
}
