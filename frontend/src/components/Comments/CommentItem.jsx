import ChannelLink from "../ChannelLink";
import { timeAgo } from "../../api";
import Avatar from "./Avatar";
import CommentBox from "./CommentBox";
import CommentReplies from "./CommentReplies";
import { useReplies } from "./useReplies";

function CommentHeader({ c, navigate }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
      <ChannelLink channelId={c.author_channel_id} name={c.author} navigate={navigate} style={{ fontSize: 13, fontWeight: 500 }} />
      {c.author_is_uploader && (
        <span style={{ fontSize: 10, color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 4, padding: "0 4px" }}>
          AUTORE
        </span>
      )}
      <span style={{ fontSize: 12, color: "var(--text3)" }}>{timeAgo(c.published)}</span>
    </div>
  );
}

function CommentActions({ c, supportsReplies, canComment, onReplyClick }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 6 }}>
      {c.likes > 0 && <span style={{ fontSize: 12, color: "var(--text3)" }}>👍 {c.likes}</span>}
      {supportsReplies && canComment && (
        <button
          onClick={onReplyClick}
          style={{ background: "none", border: "none", color: "var(--text2)", fontSize: 12, cursor: "pointer", padding: 0, fontFamily: "inherit" }}
        >
          Rispondi
        </button>
      )}
    </div>
  );
}

function ReplyComposer({ c, rep, me }) {
  if (!rep.replying) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <CommentBox
        me={me} autoFocus
        placeholder={`Rispondi a ${c.author || "questo commento"}...`}
        busy={rep.posting} onSubmit={rep.submitReply} onCancel={() => rep.setReplying(false)}
      />
    </div>
  );
}

export default function CommentItem({ c, videoId, me, canComment, supportsReplies, navigate, onToast }) {
  const rep = useReplies(videoId, c.id, onToast);
  const onToggleReplies = () =>
    rep.repliesOpen ? rep.setRepliesOpen(false) : (rep.replies.length ? rep.setRepliesOpen(true) : rep.loadReplies());

  return (
    <div style={{ display: "flex", gap: 12 }}>
      <Avatar src={c.author_thumbnail} name={c.author} channelId={c.author_channel_id} navigate={navigate} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <CommentHeader c={c} navigate={navigate} />
        <div style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {c.text}
        </div>
        <CommentActions c={c} supportsReplies={supportsReplies} canComment={canComment} onReplyClick={() => rep.setReplying(v => !v)} />
        <ReplyComposer c={c} rep={rep} me={me} />
        <CommentReplies
          replies={rep.replies} repliesToken={rep.repliesToken} repliesOpen={rep.repliesOpen}
          repliesLoading={rep.repliesLoading} replyCount={c.reply_count || 0} supportsReplies={supportsReplies}
          onToggle={onToggleReplies} onLoadMore={() => rep.loadReplies(rep.repliesToken)} navigate={navigate}
        />
      </div>
    </div>
  );
}
