"""
watch_progress.py — fin dove è stato visto un video: salvataggio dal player,
punto di ripresa all'apertura, barrette rosse sulle miniature.

Un modulo a sé e non dentro routers/history.py per restare sotto le 5
funzioni per file (vedi CLAUDE.md); la logica è in auth/watch_progress.py.
"""
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from auth import watch_progress
from auth.state import state

router = APIRouter()


class ProgressUpdate(BaseModel):
    # Limiti larghi ma finiti: il valore finisce nel JSON della cronologia, e
    # un NaN o un infinito (json li accetta, il browser poi no) lo romperebbe.
    position: float = Field(ge=0, le=7 * 86400)
    duration: Optional[float] = Field(default=None, ge=0, le=7 * 86400)
    # Pausa, uscita dal video, app in background: scritto subito su disco.
    final: bool = False


@router.patch("/api/history/{video_id}/progress")
async def update_progress(video_id: str, body: ProgressUpdate):
    """Aggiornamento leggero dal player (ogni ~15s e su pausa/uscita). `ok` falso se il video non è in cronologia."""
    return {"ok": watch_progress.update_progress(state, video_id, body.model_dump())}


@router.get("/api/history/progress")
async def progress_map():
    """Le posizioni salvate di tutta la cronologia, per le barrette sulle card."""
    return {"progress": watch_progress.progress_map(state)}


@router.get("/api/history/{video_id}/progress")
async def resume_point(video_id: str):
    """Da dove riaprire il video: il player lo chiede prima di aprire /api/mux."""
    return watch_progress.resume_point(state, video_id)
