"""
watch_later.py — coda "Guarda più tardi", locale come la cronologia.

Niente OAuth: la playlist "WL" di YouTube non è leggibile dalla Data API (la
restituisce vuota da anni), e salvare un video per dopo non deve richiedere un
account. La coda vive in data/watch_later.json.

Verso il frontend è una playlist come le altre, con id `WL` — lo stesso che usa
YouTube (/watch?v=…&list=WL): /api/playlist/WL risponde con questa coda, così
pagina playlist, pannello nella pagina video e avanzamento automatico non hanno
un caso a parte (vedi routers/playlists.py).
"""
import time

from auth.config import WATCH_LATER_MAX
from auth.storage import WATCH_LATER_FILE, _scrivi_json

WATCH_LATER_ID = "WL"


def _save(state):
    _scrivi_json(WATCH_LATER_FILE, state.watch_later)


def is_saved(state, video_id: str) -> bool:
    return any(v.get("id") == video_id for v in state.watch_later)


def add_to_watch_later(state, video: dict) -> bool:
    """
    Accoda un video. False se c'era già: resta al suo posto, non va in fondo —
    la coda si guarda in ordine, e ri-salvare un video non deve rimandarlo.
    Oltre WATCH_LATER_MAX si toglie il più vecchio.
    """
    if is_saved(state, video.get("id")):
        return False
    state.watch_later.append({
        "id": video.get("id"),
        "title": video.get("title"),
        "channel": video.get("channel"),
        "channel_id": video.get("channel_id"),
        "duration": video.get("duration"),
        "thumbnail": video.get("thumbnail")
                     or f"https://i.ytimg.com/vi/{video.get('id')}/hqdefault.jpg",
        "added_at": time.time(),
    })
    del state.watch_later[:-WATCH_LATER_MAX]
    _save(state)
    return True


def remove_from_watch_later(state, video_id: str) -> bool:
    """Toglie un video dalla coda. False se non c'era."""
    prima = len(state.watch_later)
    state.watch_later = [v for v in state.watch_later if v.get("id") != video_id]
    if len(state.watch_later) == prima:
        return False
    _save(state)
    return True


def watch_later_page(state, offset: int, limit: int) -> dict:
    """La coda nello stesso formato di /api/playlist/<id> (vedi feed_playlist.py)."""
    voci = state.watch_later
    return {
        "results": voci[offset:offset + limit],
        "total": len(voci),
        "has_more": offset + limit < len(voci),
        "playlist": {
            "id": WATCH_LATER_ID, "title": "Guarda più tardi", "channel": None,
            "channel_id": None, "count": len(voci), "views": None, "updated": None,
            "description": "", "local": True,
            "thumbnail": voci[0]["thumbnail"] if voci else None,
        },
        **({} if voci else {"reason": "coda-vuota"}),
    }
