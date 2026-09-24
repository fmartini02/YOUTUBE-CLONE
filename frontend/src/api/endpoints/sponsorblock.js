import { apiFetch } from "../core";

// Oltre il timeout del server (4s, server/routers/sponsorblock.py) più un
// margine per la LAN: se il server stesso non risponde, il player non deve
// restare in attesa di segmenti che non arriveranno — non li aspetta
// comunque per partire, ma una richiesta appesa terrebbe viva la promessa.
const TIMEOUT_MS = 6000;

export const sponsorblockEndpoints = {
  sponsorSegments: (id) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    return apiFetch(`/api/sponsorblock/${encodeURIComponent(id)}`, { signal: ctrl.signal })
      .finally(() => clearTimeout(timer));
  },
};
