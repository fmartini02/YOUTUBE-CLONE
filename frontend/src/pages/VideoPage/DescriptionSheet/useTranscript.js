import { useState, useEffect } from "react";
import { api } from "../../../api";
import { parseVtt } from "./vtt";

// Una trascrizione scaricata resta qui per la sessione: /api/subtitles rifà
// un'estrazione yt-dlp completa ad ogni chiamata (1-3 secondi), e passare da
// "Trascrizione" a "Capitoli" e ritorno smonta e rimonta la scheda. Tetto
// basso: sono liste di migliaia di righe e servono solo mentre si guarda.
const cache = new Map();
const MAX_CACHE = 4;

/**
 * Stessa preferenza del pulsante sottotitoli del player (vedi toggleSubtitles
 * in components/VideoPlayer/index.jsx): la lingua già accesa se c'è, poi
 * l'italiano esatto, poi una sua variante regionale, poi la prima della lista.
 */
export function scegliLingua(subtitleLangs, subtitleLang) {
  if (subtitleLang) return subtitleLang;
  const lingue = subtitleLangs || [];
  return lingue.find(l => l.code === "it")?.code
    || lingue.find(l => l.code?.startsWith("it"))?.code
    || lingue[0]?.code
    || "";
}

async function scaricaTrascrizione(videoId, lang) {
  const chiave = `${videoId}:${lang}`;
  if (cache.has(chiave)) return cache.get(chiave);
  const risposta = await fetch(api.subtitleUrl(videoId, lang));
  if (!risposta.ok) throw new Error(`HTTP ${risposta.status}`);
  const righe = parseVtt(await risposta.text());
  if (cache.size >= MAX_CACHE) cache.clear();
  cache.set(chiave, righe);
  return righe;
}

/**
 * Scarica e legge il .vtt della lingua scelta. Parte al montaggio di chi lo
 * usa — cioè solo quando la scheda "Trascrizione" viene davvero aperta, mai
 * insieme al resto della pagina video.
 */
export function useTranscript(videoId, subtitleLangs, subtitleLang) {
  const lang = scegliLingua(subtitleLangs, subtitleLang);
  // Si parte già "in caricamento" se una lingua c'è: l'effect gira DOPO il
  // primo disegno, e partendo da fermo per un istante si leggeva "non ci sono
  // sottotitoli" su un video che invece li ha — visto davvero, in prova.
  const [stato, setStato] = useState({ righe: [], caricamento: !!lang, errore: "" });

  useEffect(() => {
    if (!videoId || !lang) { setStato({ righe: [], caricamento: false, errore: "" }); return undefined; }
    let annullato = false;
    setStato({ righe: [], caricamento: true, errore: "" });
    scaricaTrascrizione(videoId, lang)
      .then(righe => { if (!annullato) setStato({ righe, caricamento: false, errore: "" }); })
      .catch(() => { if (!annullato) setStato({ righe: [], caricamento: false, errore: "scaricamento" }); });
    return () => { annullato = true; };
  }, [videoId, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  return { ...stato, lang };
}
