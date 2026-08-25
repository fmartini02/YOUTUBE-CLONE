import VideoChannelRow from "./VideoChannelRow";
import VideoDescription from "./VideoDescription";

function InfoSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
      <div className="skeleton skeleton-line" style={{ height: 22 }} />
      <div className="skeleton skeleton-line short" />
    </div>
  );
}

export default function VideoInfoSection({
  info, descExpanded, setDescExpanded, channelAvatar, navigate,
  addToast, onSubsChange, cast, castMedia, onDownload, videoId,
}) {
  if (!info) return <InfoSkeleton />;
  return (
    <>
      <h1 className="video-title-big">{info.title}</h1>
      <VideoChannelRow
        info={info} channelAvatar={channelAvatar} navigate={navigate} addToast={addToast}
        onSubsChange={onSubsChange} cast={cast} castMedia={castMedia} onDownload={onDownload} videoId={videoId}
      />
      <VideoDescription info={info} expanded={descExpanded} setExpanded={setDescExpanded} />
    </>
  );
}
