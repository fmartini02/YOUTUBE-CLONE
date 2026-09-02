import { api } from "../../api";
import Comments from "../../components/Comments";
import { useVideoPageState } from "./useVideoPageState";
import VideoMainPlayer from "./VideoMainPlayer";
import VideoInfoSection from "./VideoInfoSection";
import RelatedSidebar from "./RelatedSidebar";

function downloadVideo(videoId, quality, info, addToast) {
  const url = api.downloadUrl(videoId, quality);
  const a = document.createElement("a");
  a.href = url;
  a.download = (info?.title || videoId) + ".mp4";
  a.click();
  addToast("⬇ Download avviato...");
}

function VideoMain({ s, videoId, navigate, onSubsChange }) {
  return (
    <div className="video-main">
      <VideoMainPlayer
        isCasting={s.isCasting} cast={s.cast} videoId={videoId} quality={s.quality} cambiaQualita={s.cambiaQualita}
        info={s.info} subtitleLang={s.subtitleLang} setSubtitleLang={s.setSubtitleLang} subtitleLangs={s.subtitleLangs}
        subtitleSize={s.subtitleSize} setSubtitleSize={s.setSubtitleSize} theater={s.theater} toggleTheater={s.toggleTheater}
        addToast={s.addToast} autoplay={s.prefs.autoplay !== false} fitScreen={s.prefs.fitScreen !== false}
        castMedia={s.castMedia}
      />
      <VideoInfoSection
        info={s.info} descExpanded={s.descExpanded} setDescExpanded={s.setDescExpanded} channelAvatar={s.channelAvatar}
        navigate={navigate} addToast={s.addToast} onSubsChange={onSubsChange} cast={s.cast} castMedia={s.castMedia}
        onDownload={() => downloadVideo(videoId, s.quality, s.info, s.addToast)} videoId={videoId} canRate={s.canRate}
      />
    </div>
  );
}

/**
 * Pagina video: player + info + commenti a sinistra, correlati a destra.
 * Vedi useVideoPageState.js per lo stato (metadati, correlati, sottotitoli,
 * qualità, cinema, cast).
 */
export default function VideoPage({ videoId, navigate, authStatus, onSubsChange }) {
  const s = useVideoPageState(videoId, authStatus);

  return (
    <div className="video-page">
      {/* video-left tiene insieme player e commenti — sul desktop sono la
          stessa colonna — ma li lascia separabili: sul telefono i correlati
          vanno FRA i due (vedi App.css, RESPONSIVE). */}
      <div className={`video-page-layout${s.theater ? " theater" : ""}`}>
        <div className="video-left">
          <VideoMain s={s} videoId={videoId} navigate={navigate} onSubsChange={onSubsChange} />
          {s.info && (
            <div className="video-comments">
              <Comments videoId={videoId} channelId={s.info.channel_id} authStatus={authStatus} navigate={navigate} onToast={s.addToast} />
            </div>
          )}
        </div>
        <RelatedSidebar
          related={s.related.related} navigate={navigate} sentinelRef={s.related.sentinelRef}
          loading={s.related.loading} cast={s.cast} addToast={s.addToast}
        />
      </div>
      <s.ToastContainer />
    </div>
  );
}
