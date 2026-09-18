import VideoChannelRow from "./VideoChannelRow";
import VideoDescription from "./VideoDescription";
import DescriptionSheet from "./DescriptionSheet";

function InfoSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
      <div className="skeleton skeleton-line" style={{ height: 22 }} />
      <div className="skeleton skeleton-line short" />
    </div>
  );
}

/** La card chiusa e, sopra di essa, il pannello a comparsa quando è aperto.
    Il pannello è montato solo da aperto: così non scarica la trascrizione né
    si registra sul tasto Indietro quando nessuno lo sta guardando. */
function DescrizioneEPannello({ info, videoId, desc, canale, sottotitoli }) {
  return (
    <>
      <VideoDescription info={info} expanded={desc.expanded} setExpanded={desc.setExpanded} />
      {desc.expanded && (
        <DescriptionSheet
          info={info} videoId={videoId} onClose={() => desc.setExpanded(false)}
          richiediSeek={desc.richiediSeek} canale={canale} sottotitoli={sottotitoli}
        />
      )}
    </>
  );
}

export default function VideoInfoSection({
  info, descExpanded, setDescExpanded, channelAvatar, navigate,
  addToast, onSubsChange, cast, isCasting, onDownload, videoId, canRate,
  richiediSeek, subtitleLangs, subtitleLang,
}) {
  if (!info) return <InfoSkeleton />;
  return (
    <>
      <h1 className="video-title-big">{info.title}</h1>
      <VideoChannelRow
        info={info} channelAvatar={channelAvatar} navigate={navigate} addToast={addToast}
        onSubsChange={onSubsChange} cast={cast} isCasting={isCasting} onDownload={onDownload}
        videoId={videoId} canRate={canRate}
      />
      <DescrizioneEPannello
        info={info} videoId={videoId}
        desc={{ expanded: descExpanded, setExpanded: setDescExpanded, richiediSeek }}
        canale={{ channelAvatar, navigate, addToast, onSubsChange }}
        sottotitoli={{ subtitleLangs, subtitleLang }}
      />
    </>
  );
}
