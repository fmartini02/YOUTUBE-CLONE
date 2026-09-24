"""watch_later.py — coda "Guarda più tardi": leggere, aggiungere, togliere."""
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from auth import watch_later as auth_watch_later
from auth.state import state

router = APIRouter()


class WatchLaterEntry(BaseModel):
    id: str
    title: str
    channel: Optional[str] = None
    channel_id: Optional[str] = None
    duration: Optional[float] = None
    thumbnail: Optional[str] = None


@router.get("/api/watch-later")
async def get_watch_later():
    """La coda intera, dal video salvato per primo. Come playlist: /api/playlist/WL."""
    return {"videos": state.watch_later}


@router.get("/api/watch-later/{video_id}")
async def watch_later_status(video_id: str):
    """Il video è in coda? Serve al pulsante "Salva" della pagina video."""
    return {"saved": auth_watch_later.is_saved(state, video_id)}


@router.post("/api/watch-later")
async def add_watch_later(entry: WatchLaterEntry):
    """`added` false = c'era già (resta al suo posto)."""
    added = auth_watch_later.add_to_watch_later(state, entry.dict())
    return {"ok": True, "added": added}


@router.delete("/api/watch-later/{video_id}")
async def remove_watch_later(video_id: str):
    return {"ok": auth_watch_later.remove_from_watch_later(state, video_id)}
