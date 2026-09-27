import { getLanBase, getServerBase } from "../base";
import { codecScelto } from "../codecDevice";

export const streamingEndpoints = {
  downloadUrl: (id, quality = "best") => `${getServerBase()}/api/download/${id}?quality=${quality}`,
  // start: secondo da cui far ripartire il flusso. Il flusso di /api/mux non è
  // cercabile dal browser (niente Range), quindi il seek si fa riaprendo lo
  // stream da un altro punto — vedi VideoPlayer.jsx.
  // `codec`: il codec che questo dispositivo decodifica meglio (test fatto una
  // volta all'avvio, vedi api/codecDevice.js); assente finché non c'è.
  muxUrl: (id, quality = "best", start = 0) => {
    const codec = codecScelto();
    return `${getServerBase()}/api/mux/${id}?quality=${quality}${codec ? `&codec=${codec}` : ""}${start > 0 ? `&start=${start.toFixed(2)}` : ""}`;
  },
  // Per il Chromecast: URL assoluto (la TV scarica da sé) e codec compatibili.
  // `start`: come muxUrl, il flusso non è cercabile — sui salti via cast si
  // ricarica il media da un altro punto (vedi CastRemote / nativeCast.js).
  castUrl: (id, quality = "best", start = 0) =>
    `${getLanBase()}/api/mux/${id}?quality=${quality}&compat=1${start > 0 ? `&start=${start.toFixed(2)}` : ""}`,
};
