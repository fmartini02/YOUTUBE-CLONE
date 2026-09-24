"""search.py — ricerca YouTube e autocomplete."""
import json
import urllib.parse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from auth.cookie_session import crea_ydl
from auth.mapping_search import map_search_entry
from ytdlp.helpers import in_executor, ydl_opts_base
from ytdlp.search_filters import FiltriRicerca, normalizza_filtri, url_ricerca

router = APIRouter()


@router.get("/api/search")
async def search(q: str = Query(...), page: int = 1, filtri: FiltriRicerca = Depends()):
    """
    Ricerca con filtri facoltativi (`tipo`, `durata`, `data`, `ordina`: vedi
    `ytdlp/search_filters.py`). Senza filtro sul tipo i risultati mescolano
    video, canali e playlist come su YouTube: ogni voce ha un `kind`.
    `filtri` nella risposta dice quali filtri sono stati applicati davvero.
    """
    try:
        per_page = 20
        attivi = normalizza_filtri(filtri)
        url = url_ricerca(q, attivi)

        # playlist_items ritaglia il blocco della pagina chiesta: le
        # continuazioni di YouTube si scorrono comunque dall'inizio (per la
        # pagina 2 se ne leggono 40), come già con ytsearchN.
        def _estrai():
            opts = {**ydl_opts_base(), "playlist_items": f"{(page - 1) * per_page + 1}-{page * per_page}"}
            with crea_ydl(opts) as ydl:
                return ydl.extract_info(url, download=False)

        info = await in_executor(_estrai)
        entries = [e for e in (info or {}).get("entries") or [] if e]
        results = [r for r in map(map_search_entry, entries) if r]
        # has_more sulle voci grezze: un Mix scartato non vuol dire "finito".
        return {"results": results, "query": q, "filtri": attivi, "has_more": len(entries) >= per_page}
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
