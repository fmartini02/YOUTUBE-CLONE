import { useCallback } from "react";
import { api } from "../../api";

const FONT_SCALE = { small: 0.75, normal: 1, large: 1.4 };

/**
 * Ricarica il video sulla TV alla posizione corrente con qualità e sottotitolo
 * aggiornati — sul Default Media Receiver di Google i track e la sorgente si
 * cambiano solo così (vanno dichiarati al load), come il player locale riapre
 * il flusso su un cambio di qualità. La velocità viene riapplicata dallo stesso
 * load (un nuovo load la azzererebbe sul receiver).
 *
 * Sull'APK `api.castUrl`/`api.castSubtitleUrl` sono già URL LAN assoluti
 * (getLanBase = l'indirizzo salvato in ServerSetup), quindi niente riscrittura
 * dell'origine come fa CastButton per il caso desktop-su-localhost.
 */
export function useCastReload(cast, videoId, castMedia) {
  return useCallback((quality, subLang, subSize) => {
    if (!cast?.remote) return;
    const media = { ...castMedia, streamUrl: api.castUrl(videoId, quality) };
    const sub = subLang ? { url: api.castSubtitleUrl(videoId, subLang), lang: subLang } : null;
    cast.remote.reload(media, {
      at: cast.position,
      sub,
      fontScale: FONT_SCALE[subSize] || 1,
      rate: cast.playbackRate || 1,
    });
  }, [cast, videoId, castMedia]);
}
