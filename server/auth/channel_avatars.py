"""
channel_avatars.py — loghi canale in batch: {channel_id: avatar_url}.

yt-dlp in modalità flat (ricerca/liste) non include il logo del canale — va
richiesto a parte. Usa la YouTube Data API (fino a 50 id per richiesta, serve
un account collegato) con cache persistente su disco: i loghi non cambiano
quasi mai, quindi una volta risolti non li richiediamo più.
"""
import time
import httpx

from auth.config import AVATAR_MISS_TTL, YT_API_BASE
from auth.oauth_flow import get_valid_token
from auth.storage import AVATAR_CACHE_FILE, _scrivi_json


def _miss_ancora_valido(cached) -> bool:
    """True se `cached` è un segnaposto 'nessun logo' non ancora scaduto."""
    if not isinstance(cached, dict):
        return False
    return time.time() - (cached.get("miss_at") or 0) < AVATAR_MISS_TTL


async def _fetch_avatar_batch(client, token, batch, state, result) -> bool:
    """Una richiesta da fino a 50 canali. False se la API ha fallito (quota, token)."""
    r = await client.get(
        f"{YT_API_BASE}/channels",
        params={"part": "snippet", "id": ",".join(batch), "maxResults": 50},
        headers={"Authorization": f"Bearer {token}"}, timeout=15,
    )
    data = r.json()
    if "error" in data:
        # Quota finita o token rifiutato: è un guasto temporaneo, non un
        # canale senza logo. Segnarlo come "niente logo" lo renderebbe definitivo.
        print(f"[auth] Channel avatars: {data['error'].get('message')}")
        return False
    for item in data.get("items", []):
        url = item.get("snippet", {}).get("thumbnails", {}).get("default", {}).get("url")
        if url:
            state.avatar_cache[item["id"]] = url
            result[item["id"]] = url
    # Chi non è tornato dalla API non esiste (canale cancellato o id
    # sbagliato): ricordiamolo, con scadenza.
    for cid in batch:
        if cid not in result:
            state.avatar_cache[cid] = {"miss_at": time.time()}
    return True


async def get_channel_avatars(state, channel_ids: list) -> dict:
    """
    Anche i canali *senza* risposta vanno ricordati (cache negativa): sono i
    canali cancellati o gli id che la API non riconosce, e senza segnarli
    finivano nella lista dei mancanti ad ogni pagina aperta.
    """
    ids = list(dict.fromkeys(c for c in channel_ids if c))  # dedup, ordine preservato
    result, missing = {}, []
    for cid in ids:
        cached = state.avatar_cache.get(cid)
        if isinstance(cached, str):
            result[cid] = cached
        elif not _miss_ancora_valido(cached):
            missing.append(cid)
    if not missing:
        return result

    token = await get_valid_token(state)
    if not token:
        return result  # senza account collegato: solo quello che è già in cache

    try:
        async with httpx.AsyncClient() as client:
            for i in range(0, len(missing), 50):
                if not await _fetch_avatar_batch(client, token, missing[i:i + 50], state, result):
                    break
        _scrivi_json(AVATAR_CACHE_FILE, state.avatar_cache)
    except Exception as e:
        print(f"[auth] Channel avatars error: {e}")

    return result


def dimentica_avatar_mancanti(state):
    """
    Cancella i segnaposti "nessun logo".

    Da chiamare quando cambia l'account collegato: senza token la API non
    risponde affatto, quindi i buchi accumulati prima del login non dicono
    niente sul canale e vanno ritentati subito invece di aspettare la scadenza.
    """
    state.avatar_cache = {
        cid: v for cid, v in state.avatar_cache.items() if isinstance(v, str)
    }
    _scrivi_json(AVATAR_CACHE_FILE, state.avatar_cache)
