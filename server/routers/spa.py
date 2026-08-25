"""
spa.py — route "finte" del frontend (History API) e i file statici buildati.

index.html non va mai messa in cache, gli asset con l'hash nel nome sempre.
Senza questa distinzione il browser tiene index.html per conto suo (nessun
header di cache = cache "euristica") e continua a caricare il bundle vecchio
anche dopo un `npm run build`. Gli asset invece hanno l'hash del contenuto
nel nome (index-BesxxQRe.js), quindi un file con quel nome non cambierà mai.
"""
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

router = APIRouter()

frontend_dist = Path(__file__).parent.parent.parent / "frontend" / "dist"

NO_CACHE = "no-cache, must-revalidate"
IMMUTABLE_CACHE = "public, max-age=31536000, immutable"


class HashedStaticFiles(StaticFiles):
    def file_response(self, full_path, stat_result, scope, status_code=200):
        resp = super().file_response(full_path, stat_result, scope, status_code)
        name = str(full_path)
        resp.headers["Cache-Control"] = (
            IMMUTABLE_CACHE if "/assets/" in name.replace("\\", "/") else NO_CACHE
        )
        return resp


@router.get("/watch")
@router.get("/search")
@router.get("/subscriptions")
@router.get("/settings")
@router.get("/channel")
@router.get("/history")
async def spa_routes():
    """
    Route "finte": il frontend naviga tra le pagine con la vera History API
    del browser (per far funzionare il tasto Indietro), quindi l'URL cambia
    davvero — es. /watch?v=xxx. Senza queste route, aprire quell'URL
    direttamente o ricaricare la pagina darebbe 404.
    """
    index = frontend_dist / "index.html"
    if not index.exists():
        raise HTTPException(404)
    return FileResponse(index, headers={"Cache-Control": NO_CACHE})
