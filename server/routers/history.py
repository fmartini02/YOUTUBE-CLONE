"""history.py — cronologia locale: aggiungere, leggere, cancellare."""
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from auth import history as auth_history
from auth.state import state

router = APIRouter()


class HistoryEntry(BaseModel):
    id: str
    title: str
    channel: Optional[str] = None
    channel_id: Optional[str] = None
    duration: Optional[float] = None
    thumbnail: Optional[str] = None


@router.post("/api/history")
async def add_history(entry: HistoryEntry):
    auth_history.add_to_history(state, entry.dict())
    return {"ok": True}


@router.get("/api/history")
async def get_history(limit: int = 200):
    """La cronologia locale, dal video più recente al più vecchio."""
    return {"history": auth_history.get_history(state, max(1, min(limit, 500)))}


@router.delete("/api/history")
async def clear_history():
    auth_history.clear_history(state)
    return {"ok": True}


@router.delete("/api/history/{video_id}")
async def remove_history(video_id: str):
    """Toglie un singolo video dalla cronologia (il × sulla card)."""
    return {"ok": auth_history.remove_from_history(state, video_id)}
