import { useState, useEffect, useCallback } from "react";
import { api } from "../../api";

/**
 * I canali della riga di "bollicine" in cima alla home.
 *
 * Tutto quello che può andare storto qui finisce in una lista vuota e basta:
 * la striscia è decorativa (l'elenco vero delle iscrizioni sta nella sua
 * pagina), quindi un errore non deve mai diventare un messaggio in home.
 *
 * `segnaVisto` spegne il pallino SUBITO, senza aspettare il server: è
 * l'effetto che l'utente si aspetta dal tocco, e se la chiamata fallisce il
 * pallino ricompare comunque al prossimo caricamento della home.
 */
export function useChannelBubbles(autenticato) {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let annullato = false;
    setLoading(true);
    api.channelBubbles()
      .then(d => { if (!annullato) setChannels(d?.channels || []); })
      .catch(() => { if (!annullato) setChannels([]); })
      .finally(() => { if (!annullato) setLoading(false); });
    return () => { annullato = true; };
  }, [autenticato]);

  const segnaVisto = useCallback((channelId) => {
    setChannels(prev => prev.map(c => (c.id === channelId ? { ...c, nuovo: false } : c)));
    api.markChannelSeen(channelId).catch(() => {});
  }, []);

  return { channels, loading, segnaVisto };
}
