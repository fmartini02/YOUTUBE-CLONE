import { getServerBase } from "./base";

// Host di YouTube che servono miniature e loghi canale.
const IMG_HOST_YT = /(?:^|\.)(?:ytimg\.com|ggpht\.com|googleusercontent\.com)$/i;

/**
 * URL di una miniatura/avatar passato per il proxy del server (/api/img).
 *
 * Sul telefono e sulla TV la WebView sta su una rete solo-LAN e non risolve
 * i.ytimg.com / yt3.ggpht.com: le immagini caricate diretto restano vuote. Il
 * server ha internet (lo usa per yt-dlp), quindi le riscarica lui. Gli URL
 * non-YouTube (data:, percorsi relativi, campo vuoto) tornano intatti, così si
 * può avvolgere ogni <img src> senza controlli extra nei componenti.
 */
export function proxyImg(url) {
  if (!url || typeof url !== "string") return url;
  let host;
  try {
    host = new URL(url, window.location.href).hostname;
  } catch {
    return url;
  }
  if (!IMG_HOST_YT.test(host)) return url;
  return `${getServerBase()}/api/img?u=${encodeURIComponent(url)}`;
}
