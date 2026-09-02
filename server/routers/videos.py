"""videos.py — azioni dell'account collegato su un singolo video.

Oggi solo il "mi piace" (`videos.rate` / `videos.getRating` della Data API v3).
Richiede l'OAuth con scope di scrittura, lo stesso di commenti e iscrizioni
(`auth.config.WRITE_SCOPE`, esposto come `can_comment` in /api/auth/status):
chi è collegato in sola lettura riceve 401 e il frontend tiene il conteggio
👍 non cliccabile.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from auth.errors import YouTubeAPIError
from auth.state import state
from auth.video_rating import get_rating, set_rating

router = APIRouter()


class RateBody(BaseModel):
    rating: str  # "like" | "none"


@router.get("/api/videos/{video_id}/rating")
async def video_rating(video_id: str):
    """Rating corrente dell'account per il video (1 unità di quota)."""
    try:
        return {"rating": await get_rating(state, video_id)}
    except PermissionError:
        return {"rating": "none", "reason": "not-authenticated"}
    except (YouTubeAPIError, ValueError) as e:
        raise HTTPException(400, str(e))


@router.post("/api/videos/{video_id}/rate")
async def rate_video(video_id: str, body: RateBody):
    """Mette/toglie "mi piace" (50 unità di quota)."""
    try:
        return {"rating": await set_rating(state, video_id, body.rating)}
    except PermissionError:
        raise HTTPException(401, "Nessun account Google collegato")
    except (YouTubeAPIError, ValueError) as e:
        raise HTTPException(400, str(e))
