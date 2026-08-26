import { apiFetch } from "../core";
import { getServerBase } from "../base";

export const watchEndpoints = {
  // Solo metadati: il flusso da riprodurre è muxUrl (vedi api/endpoints/streaming.js).
  watch: (id) => apiFetch(`/api/watch/${id}`),
  subtitleLanguages: (id) => apiFetch(`/api/subtitles/${id}`),
  subtitleUrl: (id, lang) => `${getServerBase()}/api/subtitles/${id}/${lang}.vtt`,
};
