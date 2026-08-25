"""identity.py — canale YouTube dell'account collegato (per 'commenta come')."""
from auth.oauth_status import is_authenticated
from auth.yt_api import yt_api


async def get_my_channel(state):
    """Canale YouTube dell'account collegato (nome + avatar), per la casella 'commenta come'."""
    if state.me is not None:
        return state.me or None
    if not is_authenticated(state):
        return None
    try:
        data = await yt_api(state, "GET", "channels", params={"part": "snippet", "mine": "true"})
        items = data.get("items") or []
        if not items:
            # Account Google senza canale YouTube: non può commentare.
            state.me = {}
            return None
        sn = items[0].get("snippet", {})
        state.me = {
            "channel_id": items[0].get("id"),
            "title": sn.get("title"),
            "thumbnail": (sn.get("thumbnails", {}).get("default") or {}).get("url"),
        }
        return state.me
    except Exception as e:
        print(f"[auth] get_my_channel: {e}")
        return None
