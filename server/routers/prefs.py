"""prefs.py — preferenze utente (qualità, autoplay, tema, adatta allo schermo, SponsorBlock)."""
from typing import Dict, Literal, Optional

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
    sponsorBlock: Optional[bool] = None
    # Categoria SponsorBlock → cosa fa il player. Validato qui: un valore
    # sconosciuto salvato in prefs.json il player lo tratterebbe come "ignora"
    # senza che nessuno se ne accorga.
    sponsorCategories: Optional[Dict[str, Literal["salta", "mostra", "ignora"]]] = None


@router.get("/api/prefs")
async def get_prefs():
    """Le preferenze salvate. Le legge il context usePrefs all'avvio dell'app."""
    return auth_prefs.get_prefs(state)


@router.patch("/api/prefs")
async def update_prefs(body: PrefsUpdate):
    updates = {k: v for k, v in body.dict().items() if v is not None}
    return auth_prefs.update_prefs(state, updates)
