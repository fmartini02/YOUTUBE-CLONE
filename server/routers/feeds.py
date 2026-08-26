"""feeds.py — home, iscrizioni, correlati, canale, loghi in batch."""
from fastapi import APIRouter, Query

from auth import channel_avatars, feed_channel, feed_home, feed_related, feed_subscriptions
from auth.cookies import get_cookie_path
from auth.state import state
from ytdlp.helpers import ydl_opts_base

router = APIRouter()


@router.get("/api/feed/subscriptions")
async def subscription_feed(limit: int = 30, offset: int = 0):
    """Feed 'Iscrizioni': ultimi video di tutti i canali a cui sei iscritto, paginato."""
    results = await feed_subscriptions.get_personalized_feed(state, ydl_opts_base)
    return {
        "results": results[offset:offset + limit],
        "total": len(results),
        "has_more": offset + limit < len(results),
        "source": "cookies" if get_cookie_path() else "local",
    }


@router.get("/api/feed/home")
async def home_feed(limit: int = 24, offset: int = 0):
    """
    Feed 'Home': la vera homepage di YouTube se hai caricato i cookie in
    Impostazioni. Senza cookie non esiste un ripiego: l'endpoint risponde
    vuoto e ne dichiara il motivo (no-cookies / not-logged-in / feed-vuoto).
    """
    page = await feed_home.get_home_feed_page(state, offset, limit, ydl_opts_base)
    return {**page, "source": "cookies" if page["total"] else "none"}


@router.get("/api/related/{video_id}")
async def related(video_id: str, limit: int = 20, offset: int = 0):
    """Video correlati, dal "Mix" di YouTube (playlist RD<id>): regge lo scroll infinito della sidebar."""
    return await feed_related.get_related_page(state, video_id, offset, limit, ydl_opts_base)


@router.get("/api/channel-avatars")
async def channel_avatars_endpoint(ids: str = Query(...)):
    """Loghi canale in batch: {channel_id: avatar_url}."""
    channel_ids = [c for c in ids.split(",") if c]
    avatars = await channel_avatars.get_channel_avatars(state, channel_ids)
    return {"avatars": avatars}


@router.get("/api/channel/{channel_id}/videos")
async def channel_videos(channel_id: str, limit: int = 30, offset: int = 0):
    """Video di un canale, a pagine, più l'intestazione del canale in `channel`."""
    return await feed_channel.get_channel_page(state, channel_id, offset, limit, ydl_opts_base)
