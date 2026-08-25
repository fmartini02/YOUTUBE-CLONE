import { useState } from "react";
import { api, errorMessage } from "../../api";
import { useCommentsList } from "./useCommentsList";
import { useMyChannel } from "./useMyChannel";
import CommentsHeader from "./CommentsHeader";
import CommentComposer from "./CommentComposer";
import CommentsBody from "./CommentsBody";

async function submitCommentImpl(videoId, text, list, setPosting, toast) {
  setPosting(true);
  try {
    const d = await api.postComment(videoId, text);
    list.setComments(prev => [d.comment, ...prev]);
    list.setCount(n => (n == null ? n : n + 1));
    toast("💬 Commento pubblicato");
    return true;
  } catch (e) {
    toast(errorMessage(e, "Impossibile pubblicare il commento"));
    return false;
  } finally {
    setPosting(false);
  }
}

/**
 * Sezione commenti della pagina video.
 *
 * Risposte e pubblicazione esistono solo con l'account Google collegato
 * (passano dalla YouTube Data API): senza account la sezione resta in sola
 * lettura. Vedi i singoli moduli di questa cartella per il dettaglio:
 * useCommentsList (paginazione), useMyChannel (identità), CommentItem
 * (un commento + le sue risposte, in useReplies.js).
 */
export default function Comments({ videoId, channelId, authStatus, navigate, onToast }) {
  const [sort, setSort] = useState("top"); // top (più pertinenti) | new (più recenti)
  const [posting, setPosting] = useState(false);
  const list = useCommentsList(videoId, sort, channelId);
  const me = useMyChannel(authStatus?.authenticated);
  const toast = onToast || (() => {});

  const submitComment = text => submitCommentImpl(videoId, text, list, setPosting, toast);

  return (
    <div style={{ marginTop: 24 }}>
      <CommentsHeader count={list.count} sort={sort} setSort={setSort} showSort={list.comments.length > 1 || !!list.nextToken} />
      <CommentComposer canComment={list.canComment} authenticated={authStatus?.authenticated} me={me} posting={posting} onSubmit={submitComment} />
      <CommentsBody
        loading={list.loading} comments={list.comments} error={list.error} videoId={videoId} me={me}
        canComment={list.canComment} supportsReplies={list.supportsReplies} navigate={navigate} onToast={toast}
        nextToken={list.nextToken} loadingMore={list.loadingMore} onLoadMore={() => list.load(list.nextToken)}
      />
    </div>
  );
}
