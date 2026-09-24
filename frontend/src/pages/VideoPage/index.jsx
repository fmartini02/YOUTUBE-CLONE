import { useEffect } from "react";
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

// Entrando nel widget: il pannello descrizione va chiuso (coprirebbe la pagina
// sotto e, peggio, resterebbe registrato sul tasto Indietro — il primo
// Indietro chiuderebbe un pannello invisibile). E niente widget per un video in
// cast: di norma lo esclude già la navigazione (App/navHistory.js), questo
// copre una sessione di cast che riprende da sola mentre il widget è aperto.
function useModalitaWidget(s, mini, onClose) {
  useEffect(() => { if (mini) s.setDescExpanded(false); }, [mini]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mini && s.isCasting) onClose(); }, [mini, s.isCasting]); // eslint-disable-line react-hooks/exhaustive-deps
}

function VideoMain({ s, videoId, navigate, onSubsChange, widget }) {
  return (
    <div className="video-main">
      <VideoMainPlayer
        isCasting={s.isCasting} cast={s.cast} videoId={videoId} quality={s.quality} cambiaQualita={s.cambiaQualita}
        info={s.info} subtitleLang={s.subtitleLang} setSubtitleLang={s.setSubtitleLang} subtitleLangs={s.subtitleLangs}
        subtitleSize={s.subtitleSize} setSubtitleSize={s.setSubtitleSize} theater={s.theater} toggleTheater={s.toggleTheater}
        addToast={s.addToast} autoplay={s.prefs.autoplay !== false} fitScreen={s.prefs.fitScreen !== false}
        castMedia={s.castMedia} seekRequest={s.seekRequest} widget={widget}
      />
      <VideoInfoSection
        info={s.info} descExpanded={s.descExpanded} setDescExpanded={s.setDescExpanded} channelAvatar={s.channelAvatar}
        navigate={navigate} addToast={s.addToast} onSubsChange={onSubsChange} cast={s.cast} isCasting={s.isCasting}
        onDownload={() => downloadVideo(videoId, s.quality, s.info, s.addToast)} videoId={videoId} canRate={s.canRate}
        richiediSeek={s.richiediSeek} subtitleLangs={s.subtitleLangs} subtitleLang={s.subtitleLang}
      />
    </div>
  );
}

/**
 * Pagina video: player + info + commenti a sinistra, correlati a destra.
 * Vedi useVideoPageState.js per lo stato (metadati, correlati, sottotitoli,
 * qualità, cinema, cast).
 *
 * Con `mini` la pagina resta montata ma si riduce al solo player, spostato in
 * un widget sopra la pagina corrente (vedi App/AppRoutes.jsx sul perché non va
 * mai smontata). Il resto non si smonta: si nasconde con il CSS
 * (`data-mode="mini"` in App.css), così tornando a pagina intera commenti e
 * correlati sono ancora lì, senza ricaricarli. `.mini-area` è l'area in cui
 * il widget può stare (sotto l'header, dentro lo schermo): invisibile, serve
 * solo a misurarla durante il trascinamento (VideoPlayer/miniPosition.js).
 *
 * video-left tiene insieme player e commenti — sul desktop sono la stessa
 * colonna — ma li lascia separabili: sul telefono i correlati vanno FRA i due
 * (vedi App.css, RESPONSIVE).
 */
export default function VideoPage({ videoId, navigate, authStatus, onSubsChange, mini = false, onExpand, onClose }) {
  const s = useVideoPageState(videoId, authStatus);
  useModalitaWidget(s, mini, onClose);
  const widget = { mini, onExpand, onClose };

  return (
    <div className="video-page" data-mode={mini ? "mini" : "full"}>
      <div className={`video-page-layout${s.theater ? " theater" : ""}`}>
        <div className="video-left">
          <VideoMain s={s} videoId={videoId} navigate={navigate} onSubsChange={onSubsChange} widget={widget} />
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
      {mini &&<div className="mini-area" aria-hidden="true" />}
    </div>
  );
}
