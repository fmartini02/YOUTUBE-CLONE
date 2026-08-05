import { useState, useEffect, useCallback } from "react";
import { api, timeAgo, formatViews, errorMessage } from "../api";
import ChannelLink from "./ChannelLink";

/**
 * Sezione commenti della pagina video.
 *
 * Il server pagina i commenti (vedi /api/comments): qui si tiene solo il
 * token della pagina successiva e si accodano i risultati, così "carica altri
 * commenti" arriva davvero in fondo al thread invece di fermarsi ai primi che
 * YouTube restituisce. L'ordinamento è del server — cambiarlo ricomincia da
 * capo, perché ordinare lato client solo le pagine già scaricate darebbe un
 * ordine sbagliato rispetto a quelle ancora da caricare.
 *
 * Risposte e pubblicazione esistono solo con l'account Google collegato
 * (passano dalla YouTube Data API): senza account la sezione resta in sola
 * lettura, come prima.
 */

const PAGE_SIZE = 40;

/**
 * Avatar di chi ha scritto. Con `channelId` e `navigate` porta al canale
 * dell'autore; la casella di scrittura passa solo l'immagine, quindi lì resta
 * un tondo qualsiasi.
 */
function Avatar({ src, name, size = 36, channelId, navigate }) {
  return (
    <ChannelLink
      channelId={channelId}
      name={name}
      navigate={navigate}
      className="channel-avatar"
      style={{ width: size, height: size, fontSize: size / 2.8, flexShrink: 0, overflow: "hidden" }}
    >
      {/* referrerPolicy no-referrer come nelle card: con il Referer di
          localhost yt3.ggpht.com risponde 429 e Chromium blocca la risposta —
          senza, al posto dei loghi si vedeva il testo alternativo. */}
      {src
        ? <img src={src} alt={name || ""} referrerPolicy="no-referrer" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : (name || "?").replace("@", "")[0]}
    </ChannelLink>
  );
}

/** Casella di scrittura: usata sia per un commento nuovo sia per una risposta. */
function CommentBox({ me, placeholder, busy, onSubmit, onCancel, autoFocus }) {
  const [text, setText] = useState("");

  async function submit() {
    const t = text.trim();
    if (!t || busy) return;
    const ok = await onSubmit(t);
    if (ok) setText("");
  }

  return (
    <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
      <Avatar src={me?.thumbnail} name={me?.title} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={placeholder}
          rows={text ? 3 : 1}
          autoFocus={autoFocus}
          onKeyDown={e => {
            // Ctrl/Cmd+Invio pubblica: Invio da solo va a capo, come su YouTube.
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
          }}
          style={{
            width: "100%", resize: "vertical", background: "transparent",
            border: "none", borderBottom: "1px solid var(--border)",
            color: "var(--text)", fontSize: 14, fontFamily: "inherit",
            padding: "6px 0", outline: "none", lineHeight: 1.5,
          }}
        />
        {(text || busy) && (
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            {onCancel && (
              <button className="action-btn" onClick={onCancel} disabled={busy}>Annulla</button>
            )}
            <button className="action-btn primary" onClick={submit} disabled={busy || !text.trim()}>
              {busy ? "Invio..." : "Commenta"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CommentItem({ c, videoId, me, canComment, supportsReplies, navigate, onToast }) {
  const [replies, setReplies] = useState([]);
  const [repliesToken, setRepliesToken] = useState("");
  const [repliesOpen, setRepliesOpen] = useState(false);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [replying, setReplying] = useState(false);
  const [posting, setPosting] = useState(false);

  async function loadReplies(token = "") {
    setRepliesLoading(true);
    try {
      const d = await api.commentReplies(videoId, c.id, token);
      setReplies(prev => token ? [...prev, ...(d.comments || [])] : (d.comments || []));
      setRepliesToken(d.next_page_token || "");
      setRepliesOpen(true);
    } catch {
      onToast("Impossibile caricare le risposte");
    } finally {
      setRepliesLoading(false);
    }
  }

  async function submitReply(text) {
    setPosting(true);
    try {
      const d = await api.postComment(videoId, text, c.id);
      // Appesa in fondo: è l'ordine in cui la API restituisce le risposte.
      setReplies(prev => [...prev, d.comment]);
      setRepliesOpen(true);
      setReplying(false);
      onToast("💬 Risposta pubblicata");
      return true;
    } catch (e) {
      onToast(errorMessage(e, "Impossibile pubblicare la risposta"));
      return false;
    } finally {
      setPosting(false);
    }
  }

  const replyCount = c.reply_count || 0;

  return (
    <div style={{ display: "flex", gap: 12 }}>
      <Avatar src={c.author_thumbnail} name={c.author} channelId={c.author_channel_id} navigate={navigate} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
          <ChannelLink
            channelId={c.author_channel_id}
            name={c.author}
            navigate={navigate}
            style={{ fontSize: 13, fontWeight: 500 }}
          />
          {c.author_is_uploader && (
            <span style={{ fontSize: 10, color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 4, padding: "0 4px" }}>
              AUTORE
            </span>
          )}
          <span style={{ fontSize: 12, color: "var(--text3)" }}>{timeAgo(c.published)}</span>
        </div>
        <div style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {c.text}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 6 }}>
          {c.likes > 0 && <span style={{ fontSize: 12, color: "var(--text3)" }}>👍 {c.likes}</span>}
          {supportsReplies && canComment && (
            <button
              onClick={() => setReplying(v => !v)}
              style={{ background: "none", border: "none", color: "var(--text2)", fontSize: 12, cursor: "pointer", padding: 0, fontFamily: "inherit" }}
            >
              Rispondi
            </button>
          )}
        </div>

        {replying && (
          <div style={{ marginTop: 12 }}>
            <CommentBox
              me={me}
              autoFocus
              placeholder={`Rispondi a ${c.author || "questo commento"}...`}
              busy={posting}
              onSubmit={submitReply}
              onCancel={() => setReplying(false)}
            />
          </div>
        )}

        {supportsReplies && replyCount > 0 && (
          <div style={{ marginTop: 8 }}>
            <button
              onClick={() => (repliesOpen ? setRepliesOpen(false) : (replies.length ? setRepliesOpen(true) : loadReplies()))}
              disabled={repliesLoading}
              style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 13, cursor: "pointer", padding: 0, fontFamily: "inherit" }}
            >
              {repliesLoading ? "Caricamento..." : repliesOpen ? `▲ Nascondi risposte` : `▼ ${replyCount} risposte`}
            </button>
          </div>
        )}

        {repliesOpen && replies.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 12, paddingLeft: 8, borderLeft: "2px solid var(--border)" }}>
            {replies.map(r => (
              <div key={r.id} style={{ display: "flex", gap: 10 }}>
                <Avatar src={r.author_thumbnail} name={r.author} size={26} channelId={r.author_channel_id} navigate={navigate} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                    <ChannelLink
                      channelId={r.author_channel_id}
                      name={r.author}
                      navigate={navigate}
                      style={{ fontSize: 12, fontWeight: 500 }}
                    />
                    <span style={{ fontSize: 11, color: "var(--text3)" }}>{timeAgo(r.published)}</span>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {r.text}
                  </div>
                  {r.likes > 0 && <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 4 }}>👍 {r.likes}</div>}
                </div>
              </div>
            ))}
            {repliesToken && (
              <button
                onClick={() => loadReplies(repliesToken)}
                disabled={repliesLoading}
                style={{ alignSelf: "flex-start", background: "none", border: "none", color: "var(--accent)", fontSize: 12, cursor: "pointer", padding: 0, fontFamily: "inherit" }}
              >
                {repliesLoading ? "Caricamento..." : "Altre risposte"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Comments({ videoId, channelId, authStatus, navigate, onToast }) {
  const [comments, setComments] = useState([]);
  const [count, setCount] = useState(null);
  const [nextToken, setNextToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sort, setSort] = useState("top"); // top (più pertinenti) | new (più recenti)
  const [error, setError] = useState("");
  const [supportsReplies, setSupportsReplies] = useState(false);
  const [canComment, setCanComment] = useState(false);
  const [me, setMe] = useState(null);
  const [posting, setPosting] = useState(false);

  const toast = onToast || (() => {});

  const load = useCallback(async (token) => {
    if (token) setLoadingMore(true); else setLoading(true);
    try {
      const d = await api.comments(videoId, { limit: PAGE_SIZE, sort, pageToken: token || "", channelId });
      setComments(prev => token ? [...prev, ...(d.comments || [])] : (d.comments || []));
      if (d.comment_count != null) setCount(d.comment_count);
      setNextToken(d.next_page_token || "");
      setSupportsReplies(!!d.supports_replies);
      setCanComment(!!d.can_comment);
      setError(d.error || "");
    } catch (e) {
      if (!token) setComments([]);
      setError("Commenti non disponibili.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [videoId, sort, channelId]);

  useEffect(() => {
    if (!videoId) return;
    setComments([]);
    setCount(null);
    setNextToken("");
    load("");
  }, [videoId, sort, load]);

  // Identità dell'account (nome + avatar della casella "commenta"): una sola
  // volta, non per ogni video.
  useEffect(() => {
    if (!authStatus?.authenticated) { setMe(null); return; }
    api.me().then(d => setMe(d.channel || null)).catch(() => {});
  }, [authStatus?.authenticated]);

  async function submitComment(text) {
    setPosting(true);
    try {
      const d = await api.postComment(videoId, text);
      setComments(prev => [d.comment, ...prev]);
      setCount(n => (n == null ? n : n + 1));
      toast("💬 Commento pubblicato");
      return true;
    } catch (e) {
      toast(errorMessage(e, "Impossibile pubblicare il commento"));
      return false;
    } finally {
      setPosting(false);
    }
  }

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600 }}>
          Commenti {count != null && <span style={{ color: "var(--text3)", fontWeight: 400 }}>({formatViews(count).replace(" views", "")})</span>}
        </h3>
        {(comments.length > 1 || nextToken) && (
          <select className="quality-select" value={sort} onChange={e => setSort(e.target.value)}>
            <option value="top">Più pertinenti</option>
            <option value="new">Più recenti</option>
          </select>
        )}
      </div>

      {/* Casella di scrittura, oppure il motivo per cui non c'è */}
      {canComment ? (
        <CommentBox
          me={me}
          placeholder={me?.title ? `Commenta come ${me.title}...` : "Aggiungi un commento..."}
          busy={posting}
          onSubmit={submitComment}
        />
      ) : authStatus?.authenticated ? (
        <p style={{ fontSize: 13, color: "var(--text3)", marginBottom: 20 }}>
          Per commentare serve il permesso di scrittura: ricollega l'account Google
          dalle <strong>Impostazioni</strong> (il collegamento attuale è di sola lettura).
        </p>
      ) : (
        <p style={{ fontSize: 13, color: "var(--text3)", marginBottom: 20 }}>
          Collega un account Google dalle <strong>Impostazioni</strong> per poter commentare.
        </p>
      )}

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ display: "flex", gap: 12 }}>
              <div className="skeleton" style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0 }} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <div className="skeleton skeleton-line short" />
                <div className="skeleton skeleton-line" />
              </div>
            </div>
          ))}
        </div>
      ) : comments.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text3)" }}>
          {error || "Nessun commento disponibile per questo video."}
        </p>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {comments.map(c => (
              <CommentItem
                key={c.id}
                c={c}
                videoId={videoId}
                me={me}
                canComment={canComment}
                supportsReplies={supportsReplies}
                navigate={navigate}
                onToast={toast}
              />
            ))}
          </div>

          {nextToken && (
            <button
              className="action-btn"
              onClick={() => load(nextToken)}
              disabled={loadingMore}
              style={{ marginTop: 20 }}
            >
              {loadingMore ? "Caricamento..." : "Carica altri commenti"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
