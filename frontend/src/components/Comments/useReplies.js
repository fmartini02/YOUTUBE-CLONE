import { useState, useCallback } from "react";
import { api, errorMessage } from "../../api";

async function loadRepliesImpl(videoId, commentId, token, setters) {
  setters.setRepliesLoading(true);
  try {
    const d = await api.commentReplies(videoId, commentId, token);
    setters.setReplies(prev => token ? [...prev, ...(d.comments || [])] : (d.comments || []));
    setters.setRepliesToken(d.next_page_token || "");
    setters.setRepliesOpen(true);
  } catch {
    setters.onToast("Impossibile caricare le risposte");
  } finally {
    setters.setRepliesLoading(false);
  }
}

async function submitReplyImpl(videoId, commentId, text, setters) {
  setters.setPosting(true);
  try {
    const d = await api.postComment(videoId, text, commentId);
    // Appesa in fondo: è l'ordine in cui la API restituisce le risposte.
    setters.setReplies(prev => [...prev, d.comment]);
    setters.setRepliesOpen(true);
    setters.setReplying(false);
    setters.onToast("💬 Risposta pubblicata");
    return true;
  } catch (e) {
    setters.onToast(errorMessage(e, "Impossibile pubblicare la risposta"));
    return false;
  } finally {
    setters.setPosting(false);
  }
}

/** Stato e azioni delle risposte a UN commento: caricamento pigro, apertura/chiusura, pubblicazione. */
export function useReplies(videoId, commentId, onToast) {
  const [replies, setReplies] = useState([]);
  const [repliesToken, setRepliesToken] = useState("");
  const [repliesOpen, setRepliesOpen] = useState(false);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [replying, setReplying] = useState(false);
  const [posting, setPosting] = useState(false);

  const setters = { setReplies, setRepliesToken, setRepliesOpen, setRepliesLoading, setReplying, setPosting, onToast };
  const loadReplies = useCallback(
    (token = "") => loadRepliesImpl(videoId, commentId, token, setters), [videoId, commentId, onToast]); // eslint-disable-line
  const submitReply = useCallback(
    text => submitReplyImpl(videoId, commentId, text, setters), [videoId, commentId, onToast]); // eslint-disable-line

  return { replies, repliesToken, repliesOpen, setRepliesOpen, repliesLoading, replying, setReplying, posting, loadReplies, submitReply };
}
