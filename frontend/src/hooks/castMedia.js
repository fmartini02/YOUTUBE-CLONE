/**
 * Aspetta che la scoperta dei dispositivi dia un esito, al massimo `ms`.
 * Torna false solo se dopo l'attesa non si è ancora annunciato nessuno.
 */
export async function waitForDevices(ctx, ms = 3000) {
  const scaduto = Date.now() + ms;
  while (ctx.getCastState() === "NO_DEVICES_AVAILABLE" && Date.now() < scaduto) {
    await new Promise(r => setTimeout(r, 250));
  }
  return ctx.getCastState() !== "NO_DEVICES_AVAILABLE";
}

export function buildMediaInfo(media) {
  const cc = window.chrome.cast;
  // Di norma H.264 in MP4; il 4K per il Cast esce in VP9 dentro un WebM
  // (Google Cast non regge il VP9 in MP4) — vedi api.castUrl / useCastMedia.
  const info = new cc.media.MediaInfo(media.streamUrl, media.contentType || "video/mp4");
  info.streamType = cc.media.StreamType.BUFFERED;
  info.metadata = new cc.media.GenericMediaMetadata();
  info.metadata.title = media.title || "";
  info.metadata.subtitle = media.channel || "";
  if (media.thumbnail) info.metadata.images = [new cc.Image(media.thumbnail)];
  if (media.duration) info.duration = media.duration;
  // Serve a riconoscere QUALE video sta girando sulla TV: il receiver ci
  // restituisce customData, l'URL dello stream invece può essere riscritto.
  info.customData = { videoId: media.videoId };
  return info;
}
