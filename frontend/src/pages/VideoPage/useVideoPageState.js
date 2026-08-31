import { useState, useEffect, useMemo } from "react";
import { api } from "../../api";
import { useCastContext } from "../../App";
import { useChannelAvatars } from "../../hooks/useChannelAvatars";
import { usePrefs } from "../../hooks/usePrefs";
import { useToast } from "../../hooks/useToast";
import { useVideoQuality } from "./useVideoQuality";
import { useVideoInfo } from "./useVideoInfo";
import { useRelatedVideos } from "./useRelatedVideos";
import { useSubtitleLanguages } from "./useSubtitleLanguages";
import { useTheaterMode } from "./useTheaterMode";

// Video da mandare al Chromecast. L'URL si costruisce in modo sincrono da
// videoId+quality (compat=1 → H.264/AAC): il rimux lato server parte solo
// quando la TV richiede davvero lo stream. A 1440p/4K il server passa al
// VP9 in WebM (l'unico 4K che un Chromecast decodifica), quindi cambia
// anche il contentType annunciato al receiver.
function useCastMedia(videoId, quality, info) {
  const webm = quality === "2160" || quality === "1440";
  return useMemo(() => ({
    streamUrl: api.castUrl(videoId, quality),
    contentType: webm ? "video/webm" : "video/mp4",
    title: info?.title || "Video", channel: info?.channel || "",
    thumbnail: info?.thumbnail, duration: info?.duration, videoId,
  }), [videoId, quality, info, webm]);
}

/** Raccoglie tutto lo stato della pagina video, così index.jsx resta solo markup. */
export function useVideoPageState(videoId, authStatus) {
  const { prefs, pronte: prefsPronte } = usePrefs();
  const [quality, cambiaQualita] = useVideoQuality(prefsPronte, prefs.quality);
  const { addToast, ToastContainer } = useToast();
  const cast = useCastContext();
  const info = useVideoInfo(videoId, addToast);
  const related = useRelatedVideos(videoId);
  const subtitleLangs = useSubtitleLanguages(videoId);
  const [subtitleLang, setSubtitleLang] = useState("");
  const [subtitleSize, setSubtitleSize] = useState("normal");
  const [descExpanded, setDescExpanded] = useState(false);
  const [theater, toggleTheater] = useTheaterMode();

  useEffect(() => setSubtitleLang(""), [videoId]);

  // Cast: quando questo video sta girando sulla TV il player locale lascia il
  // posto a una schermata di stato — riprodurlo anche qui vorrebbe dire
  // scaricare due volte lo stesso stream.
  const isCasting = cast?.connected && cast?.castingVideoId === videoId;

  // Logo del canale: /api/watch non lo include (yt-dlp dà solo la copertina
  // del video), quindi lo risolviamo con lo stesso hook delle card.
  const channelAsList = useMemo(() => (info?.channel_id ? [info] : []), [info]);
  const channelAvatar = useChannelAvatars(channelAsList, authStatus?.authenticated)[info?.channel_id];
  const castMedia = useCastMedia(videoId, quality, info);

  return {
    prefs, quality, cambiaQualita, addToast, ToastContainer, cast, info, related,
    subtitleLangs, subtitleLang, setSubtitleLang, subtitleSize, setSubtitleSize,
    descExpanded, setDescExpanded, theater, toggleTheater, isCasting, channelAvatar, castMedia,
  };
}
