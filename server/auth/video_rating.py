"""video_rating.py — mettere/togliere "mi piace" a un video (Data API v3, scope
di scrittura OAuth, lo stesso di commenti e iscrizioni — vedi config.WRITE_SCOPE)."""
from auth.yt_api import yt_api

_ALLOWED = {"like", "dislike", "none"}


async def get_rating(state, video_id: str) -> str:
    """
    Rating corrente dell'account collegato per il video: 'like' | 'dislike' |
    'none'. Costa 1 unità di quota — abbastanza poco da leggerlo all'apertura
    della pagina, così il pulsante mostra lo stato vero (anche di un "mi piace"
    messo da un altro dispositivo) invece di partire sempre da spento.
    """
    data = await yt_api(state, "GET", "videos/getRating", params={"id": video_id})
    items = data.get("items") or []
    return (items[0].get("rating") if items else "none") or "none"


async def set_rating(state, video_id: str, rating: str) -> str:
    """Imposta il rating (qui solo 'like' o 'none'). 50 unità di quota. Torna
    il rating applicato."""
    if rating not in _ALLOWED:
        raise ValueError(f"Rating non valido: {rating}")
    await yt_api(state, "POST", "videos/rate", params={"id": video_id, "rating": rating})
    return rating
