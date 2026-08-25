"""mapping.py — voce grezza di yt-dlp / della Data API -> formato usato dal frontend."""
from typing import Optional


def _iso_to_timestamp(iso: Optional[str]) -> Optional[int]:
    """publishedAt della Data API (ISO 8601 UTC) → unix timestamp, come i commenti di yt-dlp."""
    if not iso:
        return None
    from datetime import datetime
    try:
        return int(datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp())
    except Exception:
        return None


def _timestamp_to_upload_date(ts) -> Optional[str]:
    """Converte un unix timestamp (anche approssimato, vedi extractor_args approximate_date) in YYYYMMDD."""
    if not ts:
        return None
    from datetime import datetime, timezone
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y%m%d")


def is_video_entry(e) -> bool:
    """
    Scarta le voci che non sono video singoli. I feed di YouTube includono
    anche i "Mix" (playlist auto-generate, id tipo RD...): non hanno copertina
    — l'URL i.ytimg.com/vi/<id> dà 404 — e aprirli come video non funziona.
    Gli id dei video sono sempre di 11 caratteri, quelli di playlist più lunghi.
    """
    vid = (e or {}).get("id")
    return bool(vid) and len(vid) == 11


def map_video_entry(e: dict) -> dict:
    """Voce grezza di yt-dlp → formato usato dal frontend."""
    return {
        "id": e.get("id"),
        "title": e.get("title"),
        "channel": e.get("uploader") or e.get("channel"),
        "channel_id": e.get("channel_id"),
        "duration": e.get("duration"),
        "views": e.get("view_count"),
        "thumbnail": f"https://i.ytimg.com/vi/{e.get('id')}/hqdefault.jpg",
        "published": _timestamp_to_upload_date(e.get("timestamp")),
    }


def channel_meta(info: dict, channel_id: str) -> dict:
    """
    Intestazione della pagina canale, dai metadati della scheda "Video".

    Le miniature di un canale sono due cose diverse nella stessa lista: il logo
    è quadrato, la copertina è molto più larga che alta. Distinguerle per
    proporzione è l'unico modo affidabile — yt-dlp non le etichetta tutte.
    """
    def _piu_grande(scelte):
        return max(scelte, key=lambda t: t.get("width") or 0)["url"] if scelte else None

    thumbs = [t for t in (info.get("thumbnails") or []) if t.get("url")]
    quadrate = [t for t in thumbs if t.get("width") and t.get("height")
                and 0.9 <= t["width"] / t["height"] <= 1.1]
    larghe = [t for t in thumbs if t.get("width") and t.get("height")
              and t["width"] / t["height"] >= 3]

    return {
        "id": info.get("channel_id") or channel_id,
        "name": info.get("channel") or info.get("uploader"),
        "handle": info.get("uploader_id"),
        "avatar": _piu_grande(quadrate),
        "banner": _piu_grande(larghe),
        "subscribers": info.get("channel_follower_count"),
        "description": info.get("description"),
        "verified": bool(info.get("channel_is_verified")),
    }
