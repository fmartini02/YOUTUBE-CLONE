// api/ — chiamate al server, centralizzate qui invece che sparse nei
// componenti (vedi CLAUDE.md). Prima era un unico api.js con 15 funzioni di
// modulo + un oggetto `api` da 30 metodi; per restare sotto le 5 funzioni
// per file è diventato questa cartella, un modulo per dominio — la stessa
// suddivisione di server/routers/. Gli import esistenti (`from "./api"` /
// `from "../api"`) restano validi: puntano a questo index.js.
export { getServerBase, setServerBase, clearServerBase, getLanBase, isCastableOrigin } from "./base";
export { apiFetch, errorMessage } from "./core";
export { resolveCastBase, checkServerReachable } from "./cast";
export { isCapacitor } from "./device";
export { formatDuration, formatCompact, formatViews, formatDate, timeAgo } from "./format";

import { authEndpoints } from "./endpoints/auth";
import { commentsEndpoints } from "./endpoints/comments";
import { cookiesEndpoints } from "./endpoints/cookies";
import { feedsEndpoints } from "./endpoints/feeds";
import { historyEndpoints } from "./endpoints/history";
import { prefsEndpoints } from "./endpoints/prefs";
import { searchEndpoints } from "./endpoints/search";
import { streamingEndpoints } from "./endpoints/streaming";
import { subscriptionsEndpoints } from "./endpoints/subscriptions";
import { videosEndpoints } from "./endpoints/videos";
import { watchEndpoints } from "./endpoints/watch";

export const api = {
  ...searchEndpoints,
  ...watchEndpoints,
  ...streamingEndpoints,
  ...feedsEndpoints,
  ...commentsEndpoints,
  ...authEndpoints,
  ...subscriptionsEndpoints,
  ...videosEndpoints,
  ...cookiesEndpoints,
  ...historyEndpoints,
  ...prefsEndpoints,
};
