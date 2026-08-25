"""
oauth_flow.py — Device flow OAuth2 di Google: ottenere e rinnovare il token
di accesso. Vedi CLAUDE.md per perché è device flow e non redirect web.
"""
import time
from typing import Optional
import httpx

from auth.config import DEVICE_GRANT_TYPE, OAUTH_DEVICE_URL, OAUTH_SCOPES, OAUTH_TOKEN_URL
from auth.storage import TOKEN_FILE, _scrivi_json


async def start_device_flow(client_id: str) -> dict:
    """Device flow, passo 1: chiede a Google il codice da mostrare all'utente."""
    async with httpx.AsyncClient() as client:
        r = await client.post(OAUTH_DEVICE_URL, data={
            "client_id": client_id,
            "scope": OAUTH_SCOPES,
        })
        data = r.json()
        if "error" in data:
            raise ValueError(data.get("error_description", data["error"]))
        return data


def _store_token(state, data: dict, client_id: str, client_secret: str) -> dict:
    """Salva su disco il token appena ottenuto dal device flow."""
    state.token = {
        "access_token": data["access_token"],
        "refresh_token": data.get("refresh_token"),
        "expires_at": time.time() + data.get("expires_in", 3600),
        "client_id": client_id,
        "client_secret": client_secret,
        # Google restituisce gli scope effettivamente concessi: li teniamo
        # per sapere se questo token può anche commentare.
        "scope": data.get("scope", ""),
    }
    state.me = None  # identità dell'account: da rileggere
    # privato=True: contiene il refresh token, non deve essere 0644.
    _scrivi_json(TOKEN_FILE, state.token, privato=True)
    return state.token


async def poll_device_token(state, device_code: str, client_id: str, client_secret: str) -> dict:
    """Device flow, passo 2: chiede se l'utente ha già autorizzato.

    Finché non lo fa Google risponde con un errore che non è un guasto
    (`authorization_pending`, `slow_down`): lo giriamo al chiamante come
    stato, non come eccezione.
    """
    async with httpx.AsyncClient() as client:
        r = await client.post(OAUTH_TOKEN_URL, data={
            "client_id": client_id,
            "client_secret": client_secret,
            "device_code": device_code,
            "grant_type": DEVICE_GRANT_TYPE,
        })
        data = r.json()
        err = data.get("error")
        if err in ("authorization_pending", "slow_down"):
            return {"status": err}
        if err:
            return {"status": "error", "message": data.get("error_description", err)}
        _store_token(state, data, client_id, client_secret)
        return {"status": "ok"}


async def refresh_access_token(state) -> Optional[str]:
    """Rinnova automaticamente l'access token."""
    if not state.token.get("refresh_token"):
        return None
    try:
        async with httpx.AsyncClient() as client:
            r = await client.post(OAUTH_TOKEN_URL, data={
                "refresh_token": state.token["refresh_token"],
                "client_id": state.token["client_id"],
                "client_secret": state.token["client_secret"],
                "grant_type": "refresh_token",
            })
            data = r.json()
            if "access_token" in data:
                state.token["access_token"] = data["access_token"]
                state.token["expires_at"] = time.time() + data.get("expires_in", 3600)
                if data.get("scope"):
                    state.token["scope"] = data["scope"]
                _scrivi_json(TOKEN_FILE, state.token, privato=True)
                return state.token["access_token"]
    except Exception as e:
        print(f"[auth] Refresh token error: {e}")
    return None


async def get_valid_token(state) -> Optional[str]:
    """Restituisce sempre un token valido, rinnovandolo se necessario."""
    if not state.token:
        return None
    # Rinnova se scade nei prossimi 5 minuti
    if time.time() > state.token.get("expires_at", 0) - 300:
        return await refresh_access_token(state)
    return state.token.get("access_token")
