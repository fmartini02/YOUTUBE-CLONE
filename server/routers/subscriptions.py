"""subscriptions.py — iscrizioni: elenco, sync, stato, iscriviti/disiscriviti."""
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from auth import oauth_status, subscriptions_actions, subscriptions_state, subscriptions_sync
from auth.errors import YouTubeAPIError
from auth.state import state
from routers.subscription_guards import subscription_api_error, subscription_write_guard
from sync import scheduler
from ytdlp_helpers import ydl_opts_base

router = APIRouter()


@router.get("/api/subscriptions")
async def get_subscriptions():
    return {"subscriptions": subscriptions_sync.get_subscriptions(state)}


@router.post("/api/subscriptions/sync")
async def force_sync_subs():
    await scheduler.force_sync(state, ydl_opts_base)
    return {"subscriptions": subscriptions_sync.get_subscriptions(state), "sync": scheduler.get_status()}


# Sta DOPO /api/subscriptions/sync di proposito: FastAPI prova le rotte
# nell'ordine di dichiarazione e "sync" finirebbe altrimenti dentro {channel_id}.
@router.get("/api/subscriptions/status/{channel_id}")
async def subscription_status(channel_id: str):
    """Stato del pulsante "Iscriviti" per un canale. Risponde anche senza account collegato."""
    return {
        "subscribed": subscriptions_state.is_subscribed(state, channel_id),
        "authenticated": oauth_status.is_authenticated(state),
        "can_subscribe": oauth_status.can_write(state),
    }


class SubscribeInfo(BaseModel):
    # Nome e logo che il frontend sta già mostrando: usati solo come ripiego
    # se YouTube risponde "sei già iscritto" e non manda lo snippet.
    name: Optional[str] = None
    thumbnail: Optional[str] = None


@router.post("/api/subscriptions/{channel_id}")
async def subscribe_channel(channel_id: str, body: SubscribeInfo = SubscribeInfo()):
    """Iscrive l'account collegato al canale (idempotente)."""
    subscription_write_guard()
    try:
        channel = await subscriptions_actions.subscribe(state, channel_id, body.name or "", body.thumbnail or "")
    except YouTubeAPIError as ex:
        raise subscription_api_error(ex)
    except Exception as ex:
        raise HTTPException(500, str(ex))
    return {"subscribed": True, "channel": channel,
            "subscription_count": len(subscriptions_sync.get_subscriptions(state))}


@router.delete("/api/subscriptions/{channel_id}")
async def unsubscribe_channel(channel_id: str):
    """Disiscrive l'account dal canale (idempotente)."""
    subscription_write_guard()
    try:
        await subscriptions_actions.unsubscribe(state, channel_id)
    except YouTubeAPIError as ex:
        raise subscription_api_error(ex)
    except Exception as ex:
        raise HTTPException(500, str(ex))
    return {"subscribed": False,
            "subscription_count": len(subscriptions_sync.get_subscriptions(state))}
