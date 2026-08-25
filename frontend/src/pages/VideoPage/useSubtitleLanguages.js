import { useState, useEffect } from "react";
import { api } from "../../api";

/** Lingue sottotitoli disponibili — non bloccante, come i correlati. */
export function useSubtitleLanguages(videoId) {
  const [langs, setLangs] = useState([]);
  useEffect(() => {
    if (!videoId) return;
    setLangs([]);
    api.subtitleLanguages(videoId).then(d => setLangs(d.languages || [])).catch(() => {});
  }, [videoId]);
  return langs;
}
