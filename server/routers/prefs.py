"""prefs.py — preferenze utente (qualità, autoplay, tema, adatta allo schermo)."""
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from auth import prefs as auth_prefs
from auth.state import state

router = APIRouter()


class PrefsUpdate(BaseModel):
    quality: Optional[str] = None
    autoplay: Optional[bool] = None
    theme: Optional[str] = None
    fitScreen: Optional[bool] = None


@router.get("/api/prefs")
async def get_prefs():
    """Le preferenze salvate. Le legge il context usePrefs all'avvio dell'app."""
    return auth_prefs.get_prefs(state)


@router.patch("/api/prefs")
async def update_prefs(body: PrefsUpdate):
    updates = {k: v for k, v in body.dict().items() if v is not None}
    return auth_prefs.update_prefs(state, updates)
