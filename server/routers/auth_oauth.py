"""auth_oauth.py — stato dell'autenticazione, device flow OAuth, logout, identità."""
import asyncio
import json

from fastapi import APIRouter
from pydantic import BaseModel

from auth import channel_avatars, cookies as auth_cookies, identity, oauth_flow, oauth_status
from auth import prefs as auth_prefs, subscriptions_sync
from auth.state import state
from auth.storage import OAUTH_SETUP_FILE, scrivi_privato
from sync.scheduler import scheduler
from ytdlp.helpers import ydl_opts_base

router = APIRouter()


@router.get("/api/auth/status")
async def auth_status():
    return {
        "authenticated": oauth_status.is_authenticated(state),
        # False su un account collegato prima che esistessero la pubblicazione
        # dei commenti e l'iscrizione ai canali: il suo token non ha lo scope
        # di scrittura, e per riaverlo deve rifare il login.
        "can_comment": oauth_status.can_write(state),
        "can_subscribe": oauth_status.can_write(state),
        "subscription_count": len(subscriptions_sync.get_subscriptions(state)),
        "cookie": auth_cookies.get_cookie_status(),
        "sync": scheduler.get_status(),
        "prefs": auth_prefs.get_prefs(state),
    }


class DeviceStart(BaseModel):
    client_id: str
    client_secret: str


class DevicePoll(BaseModel):
    device_code: str


@router.post("/api/auth/device/start")
async def auth_device_start(body: DeviceStart):
    """Device flow: chiede il codice da digitare su google.com/device.

    È il metodo consigliato perché non usa nessun redirect: vale anche quando
    il server gira su un altro computer della rete (Raspberry, NAS).
    """
    data = await oauth_flow.start_device_flow(body.client_id)
    # scrivi_privato: contiene il client secret dell'app OAuth dell'utente.
    scrivi_privato(OAUTH_SETUP_FILE,
                   json.dumps({"client_id": body.client_id, "client_secret": body.client_secret}))
    return {
        "device_code": data["device_code"],
        "user_code": data["user_code"],
        "verification_url": data.get("verification_url") or data.get("verification_uri"),
        "interval": data.get("interval", 5),
        "expires_in": data.get("expires_in", 1800),
    }


@router.post("/api/auth/device/poll")
async def auth_device_poll(body: DevicePoll):
    """Device flow: l'utente ha autorizzato? Risponde pending finché non lo fa."""
    setup = json.loads(OAUTH_SETUP_FILE.read_text())
    res = await oauth_flow.poll_device_token(state, body.device_code, setup["client_id"], setup["client_secret"])
    if res["status"] == "ok":
        # Senza account collegato prima i loghi non si potevano chiedere
        # affatto: i "questo canale non ha logo" accumulati non valgono più.
        channel_avatars.dimentica_avatar_mancanti(state)
        asyncio.create_task(scheduler.force_sync(state, ydl_opts_base))
    return res


@router.post("/api/auth/logout")
async def logout():
    oauth_status.logout(state)
    return {"ok": True}


@router.get("/api/auth/me")
async def auth_me():
    """Canale YouTube dell'account collegato, per la casella 'commenta come'."""
    me = await identity.get_my_channel(state)
    return {"channel": me, "can_comment": oauth_status.can_write(state)}
