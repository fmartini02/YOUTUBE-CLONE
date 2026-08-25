"""comment_replies.py — risposte a un commento (solo account collegato)."""
from fastapi import APIRouter, HTTPException

from auth import comments as auth_comments, oauth_status
from auth.errors import YouTubeAPIError
from auth.state import state

router = APIRouter()


@router.get("/api/comments/{video_id}/replies")
async def get_comment_replies(video_id: str, parent_id: str, page_token: str = "", limit: int = 50):
    """Risposte a un singolo commento — solo con account collegato (yt-dlp non le sa dare a richiesta)."""
    if not oauth_status.is_authenticated(state):
        raise HTTPException(403, "Le risposte richiedono un account Google collegato")
    try:
        data = await auth_comments.list_comment_replies(state, parent_id, page_token, limit)
        return {"comments": data["comments"], "next_page_token": data["next_page_token"]}
    except YouTubeAPIError as ex:
        raise HTTPException(400, ex.message)
    except Exception as ex:
        raise HTTPException(500, str(ex))
