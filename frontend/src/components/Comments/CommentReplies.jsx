import ChannelLink from "../ChannelLink";
import { timeAgo } from "../../api";
import Avatar from "./Avatar";

function ReplyItem({ r, navigate }) {
  return (
    <div style={{ display: "flex", gap: 10 }}>
      <Avatar src={r.author_thumbnail} name={r.author} size={26} channelId={r.author_channel_id} navigate={navigate} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <ChannelLink channelId={r.author_channel_id} name={r.author} navigate={navigate} style={{ fontSize: 12, fontWeight: 500 }} />
          <span style={{ fontSize: 11, color: "var(--text3)" }}>{timeAgo(r.published)}</span>
        </div>
        <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {r.text}
        </div>
        {r.likes > 0 && <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 4 }}>👍 {r.likes}</div>}
      </div>
    </div>
  );
}

function ToggleRepliesButton({ repliesOpen, repliesLoading, replyCount, onToggle }) {
  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={onToggle}
        disabled={repliesLoading}
        style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 13, cursor: "pointer", padding: 0, fontFamily: "inherit" }}
      >
        {repliesLoading ? "Caricamento..." : repliesOpen ? "▲ Nascondi risposte" : `▼ ${replyCount} risposte`}
      </button>
    </div>
  );
}

function RepliesList({ replies, repliesToken, repliesLoading, onLoadMore, navigate }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 12, paddingLeft: 8, borderLeft: "2px solid var(--border)" }}>
      {replies.map(r => <ReplyItem key={r.id} r={r} navigate={navigate} />)}
      {repliesToken && (
        <button
          onClick={onLoadMore}
          disabled={repliesLoading}
          style={{ alignSelf: "flex-start", background: "none", border: "none", color: "var(--accent)", fontSize: 12, cursor: "pointer", padding: 0, fontFamily: "inherit" }}
        >
          {repliesLoading ? "Caricamento..." : "Altre risposte"}
        </button>
      )}
    </div>
  );
}

/** Il bottone "N risposte" / "Nascondi", e sotto la lista quando è aperta. */
export default function CommentReplies({ replies, repliesToken, repliesOpen, repliesLoading, replyCount, supportsReplies, onToggle, onLoadMore, navigate }) {
  if (!supportsReplies || replyCount <= 0) return null;

  return (
    <>
      <ToggleRepliesButton repliesOpen={repliesOpen} repliesLoading={repliesLoading} replyCount={replyCount} onToggle={onToggle} />
      {repliesOpen && replies.length > 0 && (
        <RepliesList replies={replies} repliesToken={repliesToken} repliesLoading={repliesLoading} onLoadMore={onLoadMore} navigate={navigate} />
      )}
    </>
  );
}
