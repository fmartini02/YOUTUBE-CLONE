"""yt_api.py — chiamata autenticata generica alla YouTube Data API v3."""
import httpx

from auth.config import YT_API_BASE
from auth.errors import YouTubeAPIError
from auth.oauth_flow import get_valid_token


async def yt_api(state, method: str, path: str, *, params: dict = None, json_body: dict = None) -> dict:
    """Chiamata autenticata alla Data API. Solleva ValueError/YouTubeAPIError col messaggio di Google."""
    token = await get_valid_token(state)
    if not token:
        raise PermissionError("Nessun account Google collegato")
    async with httpx.AsyncClient() as client:
        r = await client.request(
            method,
            f"{YT_API_BASE}/{path}",
            params=params,
            json=json_body,
            headers={"Authorization": f"Bearer {token}"},
            timeout=20,
        )
    # Le cancellazioni (subscriptions.delete) rispondono 204 senza corpo:
    # non c'è JSON da leggere e non è un errore. Un corpo vuoto con stato
    # di errore invece esiste, e va distinto: trattarlo come successo
    # farebbe sparire il canale dalla lista senza averlo disiscritto.
    if r.status_code == 204 or not r.content:
        if r.is_success:
            return {}
        raise YouTubeAPIError(f"Errore YouTube ({r.status_code})", "", r.status_code)
    try:
        data = r.json()
    except Exception:
        raise ValueError(f"Risposta non valida da YouTube ({r.status_code})")
    if "error" in data:
        err = data["error"]
        reason = err["errors"][0].get("reason", "") if err.get("errors") else ""
        raise YouTubeAPIError(err.get("message", "Errore YouTube"), reason, r.status_code)
    return data
