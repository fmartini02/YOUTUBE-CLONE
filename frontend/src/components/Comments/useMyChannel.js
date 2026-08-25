import { useState, useEffect } from "react";
import { api } from "../../api";

/** Identità dell'account (nome + avatar della casella "commenta"): una sola volta, non per ogni video. */
export function useMyChannel(authenticated) {
  const [me, setMe] = useState(null);
  useEffect(() => {
    if (!authenticated) { setMe(null); return; }
    api.me().then(d => setMe(d.channel || null)).catch(() => {});
  }, [authenticated]);
  return me;
}
