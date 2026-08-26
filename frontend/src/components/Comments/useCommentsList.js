import { useState, useEffect, useCallback } from "react";
import { api } from "../../api";

const PAGE_SIZE = 40;

async function loadCommentsPage(videoId, sort, channelId, token, setters) {
  if (token) setters.setLoadingMore(true); else setters.setLoading(true);
  try {
    const d = await api.comments(videoId, { limit: PAGE_SIZE, sort, pageToken: token || "", channelId });
    // `reset`: il server è passato dalla Data API al ripiego yt-dlp a metà
    // scorrimento (di solito quota finita) e ha ricominciato da capo, quindi
    // questa pagina è di nuovo la prima — accodarla ripeterebbe i commenti
    // già a schermo.
    const accoda = token && !d.reset;
    setters.setComments(prev => accoda ? [...prev, ...(d.comments || [])] : (d.comments || []));
    if (d.comment_count != null) setters.setCount(d.comment_count);
    setters.setNextToken(d.next_page_token || "");
    setters.setSupportsReplies(!!d.supports_replies);
    setters.setCanComment(!!d.can_comment);
    setters.setError(d.error || "");
  } catch {
    if (!token) setters.setComments([]);
    setters.setError("Commenti non disponibili.");
  } finally {
    setters.setLoading(false);
    setters.setLoadingMore(false);
  }
}

/**
 * Stato e paginazione dei commenti principali di un video (vedi /api/comments).
 * Si tiene solo il token della pagina successiva e si accodano i risultati,
 * così "carica altri" arriva davvero in fondo al thread. L'ordinamento è del
 * server — cambiarlo ricomincia da capo.
 */
export function useCommentsList(videoId, sort, channelId) {
  const [comments, setComments] = useState([]);
  const [count, setCount] = useState(null);
  const [nextToken, setNextToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [supportsReplies, setSupportsReplies] = useState(false);
  const [canComment, setCanComment] = useState(false);

  const setters = {
    setComments, setCount, setNextToken, setLoading, setLoadingMore,
    setError, setSupportsReplies, setCanComment,
  };
  const load = useCallback(
    (token = "") => loadCommentsPage(videoId, sort, channelId, token, setters), [videoId, sort, channelId]); // eslint-disable-line

  useEffect(() => {
    if (!videoId) return;
    setComments([]);
    setCount(null);
    setNextToken("");
    load("");
  }, [videoId, sort, load]);

  return { comments, count, nextToken, loading, loadingMore, error, supportsReplies, canComment, load, setComments, setCount };
}
