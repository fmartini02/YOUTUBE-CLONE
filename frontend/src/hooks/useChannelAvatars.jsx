import { useState, useEffect, useRef } from "react";
import { api } from "../api";

/**
 * Risolve i loghi canale per una lista di video. Alcuni video li hanno già
 * inline (feed iscrizioni, gratis dalla sync abbonamenti); per gli altri
 * (ricerca, trending, home) li richiede in batch a /api/channel-avatars,
 * una sola volta per channel_id grazie alla cache locale dell'hook.
 */
export function useChannelAvatars(videos) {
  const [avatars, setAvatars] = useState({});
  const known = useRef(new Set());

  useEffect(() => {
    const ids = [...new Set(
      videos.filter(v => !v.avatar && v.channel_id).map(v => v.channel_id)
    )].filter(id => !known.current.has(id));

    if (!ids.length) return;
    ids.forEach(id => known.current.add(id));

    api.channelAvatars(ids).then(d => {
      if (d.avatars && Object.keys(d.avatars).length) {
        setAvatars(prev => ({ ...prev, ...d.avatars }));
      }
    }).catch(() => {});
  }, [videos]);

  return avatars;
}
