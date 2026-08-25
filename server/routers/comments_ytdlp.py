"""
comments_ytdlp.py — ripiego a yt-dlp per i commenti, quando la Data API non è
disponibile (nessun account collegato). Isolato da comments.py per restare
sotto le 5 funzioni per file.

Nessuna continuazione riutilizzabile fra una richiesta e l'altra: ogni
estrazione riparte da zero e scarica i primi N commenti. Per non ri-scaricare
tutto ad ogni "carica altri" i risultati finiscono in cache e si passa allo
scaglione successivo solo quando la pagina richiesta esce dal materiale già
in mano (vedi _YTDLP_TIERS).
"""
import asyncio
import time

from auth.cookie_session import crea_ydl
from ytdlp_helpers import ydl_opts_base

_YTDLP_TIERS = [100, 300, 800, 2000]   # quanti commenti chiedere a yt-dlp, per tentativi successivi
_YTDLP_CACHE_TTL = 900                 # 15 min: oltre, il thread può essere cambiato
_YTDLP_CACHE_MAX_VIDEOS = 8            # tetto alla memoria: si ricorda solo l'ultima manciata di video
_ytdlp_comments_cache: dict = {}       # (video_id, sort) -> {comments, tier, count, at, exhausted}
_ytdlp_comments_lock = asyncio.Lock()  # una sola estrazione alla volta: sono lente e pesanti


def _extract_comments_ytdlp(video_id: str, sort: str, max_comments: int) -> dict:
    """Estrazione bloccante dei commenti principali via yt-dlp (va chiamata in un executor)."""
    base = ydl_opts_base()
    opts = {
        **base,
        "extract_flat": False,
        "getcomments": True,
        "extractor_args": {**base.get("extractor_args", {}), "youtube": {
            # [max_comments, max_parents, max_replies, max_replies_per_thread]
            "max_comments": [str(max_comments), str(max_comments), "0", "0"],
            "comment_sort": ["top" if sort != "new" else "new"],
        }},
    }
    with crea_ydl(opts) as ydl:
        info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
    comments = []
    for c in (info.get("comments") or []):
        if c.get("parent") and c.get("parent") != "root":
            continue  # solo commenti principali, niente risposte
        comments.append({
            "id": c.get("id"), "text": c.get("text"), "author": c.get("author"),
            "author_thumbnail": c.get("author_thumbnail"), "author_channel_id": c.get("author_id"),
            "author_is_uploader": bool(c.get("author_is_uploader")),
            "likes": c.get("like_count") or 0, "published": c.get("timestamp"), "reply_count": 0,
        })
    return {"comments": comments, "count": info.get("comment_count")}


async def _fetch_next_tier(video_id: str, sort: str, entry) -> dict:
    """Chiede a yt-dlp lo scaglione successivo e restituisce la nuova voce di cache."""
    tier = _YTDLP_TIERS[0] if entry is None else next(
        (t for t in _YTDLP_TIERS if t > entry["tier"]), _YTDLP_TIERS[-1]
    )
    got = await asyncio.get_event_loop().run_in_executor(
        None, _extract_comments_ytdlp, video_id, sort, tier
    )
    return {
        "comments": got["comments"], "count": got["count"], "tier": tier, "at": time.time(),
        # Meno commenti del tetto richiesto = il thread è finito.
        "exhausted": len(got["comments"]) < tier,
    }


async def comments_ytdlp_page(video_id: str, sort: str, offset: int, limit: int) -> dict:
    """Una pagina di commenti da yt-dlp, allargando la cache solo quando serve."""
    key = (video_id, sort)
    async with _ytdlp_comments_lock:
        entry = _ytdlp_comments_cache.get(key)
        if entry and time.time() - entry["at"] > _YTDLP_CACHE_TTL:
            entry = None
        # Serve altro materiale? Si sale di scaglione finché la pagina
        # richiesta non è coperta (o finché YouTube non ne dà più).
        while entry is None or (
            not entry["exhausted"]
            and offset + limit > len(entry["comments"])
            and entry["tier"] < _YTDLP_TIERS[-1]
        ):
            entry = await _fetch_next_tier(video_id, sort, entry)
            _ytdlp_comments_cache[key] = entry
            # Ogni voce può arrivare a 2000 commenti: si tengono solo gli
            # ultimi video guardati.
            while len(_ytdlp_comments_cache) > _YTDLP_CACHE_MAX_VIDEOS:
                _ytdlp_comments_cache.pop(next(iter(_ytdlp_comments_cache)))

    page = entry["comments"][offset:offset + limit]
    more = offset + len(page) < len(entry["comments"]) or not entry["exhausted"]
    return {
        "comments": page,
        # yt-dlp riporta come comment_count quanti commenti ha estratto, non
        # quanti ne ha il video: finché il thread non è finito è meglio non
        # mostrarlo affatto.
        "comment_count": entry["count"] if entry["exhausted"] else None,
        "next_page_token": str(offset + len(page)) if (more and page) else "",
        "source": "ytdlp",
    }
