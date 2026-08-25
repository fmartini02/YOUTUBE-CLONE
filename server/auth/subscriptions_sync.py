"""subscriptions_sync.py — scarica l'intero elenco iscrizioni da Google."""
import httpx

from auth.config import YT_API_BASE
from auth.oauth_flow import get_valid_token
from auth.storage import SUBS_FILE, _scrivi_json


async def _fetch_subs_page(client: httpx.AsyncClient, token: str, next_page):
    params = {"part": "snippet", "mine": "true", "maxResults": 50, "order": "alphabetical"}
    if next_page:
        params["pageToken"] = next_page
    r = await client.get(
        f"{YT_API_BASE}/subscriptions", params=params,
        headers={"Authorization": f"Bearer {token}"}, timeout=15,
    )
    return r.json()


def _map_sub_item(item: dict) -> dict:
    snippet = item.get("snippet", {})
    return {
        "id": snippet.get("resourceId", {}).get("channelId"),
        "name": snippet.get("title"),
        "thumbnail": snippet.get("thumbnails", {}).get("default", {}).get("url"),
        "description": snippet.get("description", "")[:100],
    }


async def _scan_all_pages(client: httpx.AsyncClient, token: str) -> tuple:
    """Scorre tutte le pagine di iscrizioni. (elenco, completa) — completa=False se si è fermata prima della fine."""
    subs, next_page = [], None
    while True:
        try:
            data = await _fetch_subs_page(client, token, next_page)
        except Exception as e:
            print(f"[auth] Sync iscrizioni interrotta: {e}")
            return subs, False
        if "error" in data:
            print(f"[auth] API error: {data['error']}")  # token scaduto o revocato
            return subs, False
        subs.extend(_map_sub_item(item) for item in data.get("items", []))
        next_page = data.get("nextPageToken")
        if not next_page:
            return subs, True  # ultima pagina: solo qui la lista è completa


async def sync_subscriptions(state) -> list:
    """
    Scarica tutte le iscrizioni dal canale Google dell'utente.

    La copia locale viene sostituita solo se la scansione arriva in fondo:
    una lista parziale non è "meglio di niente", è una perdita di dati. Le
    iscrizioni si leggono 50 per pagina, quindi con 120 canali un errore alla
    terza pagina (quota finita, token appena revocato, rete che cade)
    cancellava dal file i canali delle pagine mancanti.
    """
    token = await get_valid_token(state)
    if not token:
        return state.subs  # fallback cache

    async with httpx.AsyncClient() as client:
        subs, completa = await _scan_all_pages(client, token)

    if not completa:
        print(f"[auth] Iscrizioni incomplete ({len(subs)} lette): "
              f"tengo la copia locale ({len(state.subs)} canali).")
        return state.subs

    # Una lista completa e vuota è legittima (account senza iscrizioni): a
    # quel punto svuotare la copia locale è la cosa giusta.
    state.subs = subs
    _scrivi_json(SUBS_FILE, state.subs)
    return state.subs


def get_subscriptions(state) -> list:
    return state.subs
