"""images.py — proxy per le immagini di YouTube (miniature e loghi canale).

Perché serve: l'APK e la Smart TV stanno spesso su una rete solo-LAN, senza
DNS pubblico. `i.ytimg.com` e `yt3.ggpht.com` non si risolvono e le miniature
restano vuote, i loghi diventano l'iniziale del nome. Il server invece ha
internet (lo usa già per yt-dlp), quindi riscarica lui l'immagine e la rimanda
sulla LAN. Non è un proxy aperto: passa solo un elenco di host di YouTube.

Sta fuori da feeds.py perché quel file è già a 5 funzioni (CLAUDE.md).
"""
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

router = APIRouter()

# Sottodomini di YouTube/Google che servono miniature e avatar. Il confronto
# è sul suffisso ("i9.ytimg.com".endswith("ytimg.com")), quindi copre tutte
# le shard numerate senza elencarle.
_HOST_CONSENTITI = ("ytimg.com", "ggpht.com", "googleusercontent.com", "youtube.com")


@router.get("/api/img")
async def proxy_immagine(u: str):
    """Riscarica `u` (una miniatura/avatar di YouTube) e la rimanda intatta."""
    host = (urlparse(u).hostname or "").lower()
    if not host.endswith(_HOST_CONSENTITI):
        raise HTTPException(400, "host non consentito")
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=10) as client:
            r = await client.get(u, headers={"User-Agent": "Mozilla/5.0"})
    except httpx.HTTPError:
        raise HTTPException(502, "immagine non raggiungibile")
    if r.status_code != 200:
        raise HTTPException(502, "immagine non disponibile")
    return Response(
        content=r.content,
        media_type=r.headers.get("content-type", "image/jpeg"),
        # Un giorno di cache: le miniature non cambiano e così un rewind sulla
        # pagina non le riscarica.
        headers={"Cache-Control": "public, max-age=86400"},
    )
