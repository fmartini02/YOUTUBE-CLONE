"""
comments.py — commenti di un video: due sorgenti, in quest'ordine:

  1. YouTube Data API (solo con account Google collegato) — paginazione
     vera, quindi "carica altri" arriva davvero in fondo al thread, e si
     possono aprire le risposte di un commento singolo. Unica via per
     pubblicare.
  2. yt-dlp (routers/comments_ytdlp.py) — nessuna continuazione riutilizzabile,
     usato come ripiego.
"""
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from auth import comment_posting, comments as auth_comments, oauth_status
from auth.errors import YouTubeAPIError
from auth.state import state
from routers.comments_ytdlp import comments_ytdlp_page

router = APIRouter()


async def _comments_via_api(video_id: str, sort: str, page_token: str, limit: int, channel_id: str):
    """Tenta la Data API. Solleva YouTubeAPIError se non applicabile (il chiamante ripiega a yt-dlp)."""
    data = await auth_comments.list_comment_threads(state, video_id, sort, page_token, limit)
    for c in data["comments"]:
        if channel_id and c.get("author_channel_id") == channel_id:
            c["author_is_uploader"] = True
    return {
        "comments": data["comments"], "comment_count": data["total"],
        "next_page_token": data["next_page_token"], "source": "api",
        "can_comment": oauth_status.can_write(state), "supports_replies": True,
    }


async def _get_comments_ytdlp_fallback(video_id: str, sort: str, page_token: str,
                                       limit: int, can_comment: bool) -> dict:
    """
    Ripiego a yt-dlp. I due percorsi usano token diversi: la Data API dà una
    stringa opaca, questo un offset numerico generato da noi. Se la API
    funziona per la prima pagina e cade dopo (tipico: quota esaurita a metà
    scroll), qui arriva il token di Google, che `int()` non converte: si
    riparte dall'inizio e si dice al frontend di sostituire la lista
    (`reset`) invece di accodarla, perché i commenti già mostrati arrivano
    dall'altra fonte e si ripeterebbero.
    """
    offset, reset = 0, False
    if page_token:
        if page_token.isdigit():
            offset = int(page_token)
        else:
            reset = True
            print("[comments] Token della Data API su un ripiego yt-dlp: ricarico i commenti dall'inizio.")
    try:
        out = await comments_ytdlp_page(video_id, sort, offset, limit)
        out["can_comment"] = can_comment
        out["supports_replies"] = False
        if reset:
            out["reset"] = True
        return out
    except Exception:
        # Non deve mai bloccare la pagina video: si mostra una sezione
        # vuota invece di un errore.
        return {"comments": [], "comment_count": None, "next_page_token": "",
                "source": "ytdlp", "can_comment": can_comment,
                "supports_replies": False, "error": "Commenti non disponibili al momento."}


@router.get("/api/comments/{video_id}")
async def get_comments(
    video_id: str,
    limit: int = 40,
    sort: str = "top",              # top (più pertinenti) | new (più recenti)
    page_token: str = "",           # vuoto = prima pagina
    channel_id: str = "",           # canale del video: serve per l'etichetta AUTORE
):
    """Una pagina di commenti principali (chiamata separata da /api/watch: non rallenta l'avvio del video)."""
    sort = "new" if sort == "new" else "top"
    limit = max(1, min(limit, 100))
    can_comment = oauth_status.can_write(state)

    if oauth_status.is_authenticated(state):
        try:
            return await _comments_via_api(video_id, sort, page_token, limit, channel_id)
        except YouTubeAPIError as ex:
            if ex.reason in ("commentsDisabled", "videoNotFound"):
                return {"comments": [], "comment_count": None, "next_page_token": "",
                        "source": "api", "can_comment": False, "supports_replies": True,
                        "error": "I commenti sono disattivati per questo video."}
            # Quota finita, API non abilitata, token con scope vecchio: si
            # ripiega su yt-dlp invece di lasciare la sezione vuota.
            print(f"[comments] Data API non utilizzabile ({ex.reason}): {ex.message}")
        except Exception as ex:
            print(f"[comments] Data API errore: {ex}")

    return await _get_comments_ytdlp_fallback(video_id, sort, page_token, limit, can_comment)


class NewComment(BaseModel):
    text: str
    parent_id: Optional[str] = None   # valorizzato = risposta a un commento


@router.post("/api/comments/{video_id}")
async def create_comment(video_id: str, body: NewComment):
    """Pubblica un commento (o una risposta) a nome dell'account collegato."""
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(400, "Il commento è vuoto")
    if not oauth_status.is_authenticated(state):
        raise HTTPException(403, "Collega un account Google per commentare")
    if not oauth_status.can_write(state):
        raise HTTPException(403, "L'account collegato non ha il permesso di commentare: "
                                 "ricollegalo dalle impostazioni per concederlo")
    try:
        if body.parent_id:
            comment = await comment_posting.post_reply(state, body.parent_id, text)
        else:
            comment = await comment_posting.post_comment(state, video_id, text)
        return {"comment": comment}
    except YouTubeAPIError as ex:
        if ex.reason in ("insufficientPermissions", "forbidden"):
            raise HTTPException(403, "Permesso negato da YouTube: ricollega l'account dalle impostazioni")
        if ex.reason == "commentsDisabled":
            raise HTTPException(400, "I commenti sono disattivati per questo video")
        if ex.reason in ("quotaExceeded", "rateLimitExceeded"):
            raise HTTPException(429, "Quota giornaliera della YouTube Data API esaurita")
        raise HTTPException(400, ex.message)
    except Exception as ex:
        raise HTTPException(500, str(ex))
