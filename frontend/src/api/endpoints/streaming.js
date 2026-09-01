import { getLanBase, getServerBase } from "../base";

export const streamingEndpoints = {
  downloadUrl: (id, quality = "best") => `${getServerBase()}/api/download/${id}?quality=${quality}`,
  // start: secondo da cui far ripartire il flusso. Il flusso di /api/mux non è
  // cercabile dal browser (niente Range), quindi il seek si fa riaprendo lo
  // stream da un altro punto — vedi VideoPlayer.jsx.
  muxUrl: (id, quality = "best", start = 0) =>
    `${getServerBase()}/api/mux/${id}?quality=${quality}${start > 0 ? `&start=${start.toFixed(2)}` : ""}`,
  // Per il Chromecast: URL assoluto (la TV scarica da sé) e codec compatibili.
  // `start`: come muxUrl, il flusso non è cercabile — sui salti via cast si
  // ricarica il media da un altro punto (vedi CastRemote / nativeCast.js).
  castUrl: (id, quality = "best", start = 0) =>
    `${getLanBase()}/api/mux/${id}?quality=${quality}&compat=1${start > 0 ? `&start=${start.toFixed(2)}` : ""}`,
};
