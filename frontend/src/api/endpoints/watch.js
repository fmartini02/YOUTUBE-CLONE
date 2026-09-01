import { apiFetch } from "../core";
import { getServerBase, getLanBase } from "../base";

export const watchEndpoints = {
  // Solo metadati: il flusso da riprodurre è muxUrl (vedi api/endpoints/streaming.js).
  watch: (id) => apiFetch(`/api/watch/${id}`),
  subtitleLanguages: (id) => apiFetch(`/api/subtitles/${id}`),
  subtitleUrl: (id, lang) => `${getServerBase()}/api/subtitles/${id}/${lang}.vtt`,
  // Per il Chromecast: URL assoluto (il receiver scarica il track da sé). Il
  // server aggiunge Access-Control-Allow-Origin: * su questo .vtt, che serve
  // ai track side-loaded del receiver (a differenza del flusso video).
  castSubtitleUrl: (id, lang) => `${getLanBase()}/api/subtitles/${id}/${lang}.vtt`,
};
