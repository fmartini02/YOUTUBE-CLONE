"""search.py — ricerca YouTube e autocomplete."""
import json
import urllib.parse

import httpx
from fastapi import APIRouter, HTTPException, Query

from auth.cookie_session import crea_ydl
from auth.mapping import is_video_entry, map_video_entry
from ytdlp_helpers import in_executor, ydl_opts_base

router = APIRouter()


@router.get("/api/search")
async def search(q: str = Query(...), page: int = 1):
    """Search YouTube videos."""
    try:
        # ytsearchN chiede N risultati TOTALI: per la pagina 2 servono 40
        # risultati da cui prendere il secondo blocco.
        per_page = 20
        want = page * per_page

        def _estrai():
            opts = {
                **ydl_opts_base(),
                "playlist_items": f"{(page - 1) * per_page + 1}-{want}",
            }
            with crea_ydl(opts) as ydl:
                return ydl.extract_info(f"ytsearch{want}:{q}", download=False)

        info = await in_executor(_estrai)
        entries = (info or {}).get("entries") or []
        results = [map_video_entry(e) for e in entries if is_video_entry(e)]
        return {"results": results, "query": q, "has_more": len(results) >= per_page}
    except Exception as ex:
        raise HTTPException(500, str(ex))


@router.get("/api/suggestions")
async def suggestions(q: str = Query(...)):
    """Autocomplete suggestions."""
    try:
        encoded = urllib.parse.quote(q)
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q={encoded}",
                timeout=5,
            )
            text = r.text
            # JSONP: window.google.ac.h(["q",[[...],[...],...]]) — basta
            # togliere il wrapper della callback e parsare tutto insieme.
            inizio = text.index("(")
            fine = text.rindex(")")
            data = json.loads(text[inizio + 1:fine])
            items = data[1]
            return {"suggestions": [i[0] if isinstance(i, list) else i for i in items[:8]]}
    except Exception:
        pass
    return {"suggestions": []}
