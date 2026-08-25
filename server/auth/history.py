"""history.py — cronologia locale dei video guardati."""
import time

from auth.config import HISTORY_MAX
from auth.storage import HISTORY_FILE, _scrivi_json


def _save_history(state):
    # La cronologia è ordinata dal più recente al più vecchio (add_to_history
    # inserisce in testa), quindi si tengono i PRIMI HISTORY_MAX.
    _scrivi_json(HISTORY_FILE, state.history[:HISTORY_MAX])


def add_to_history(state, video: dict):
    """Aggiunge un video in testa alla cronologia locale (più recente per primo)."""
    state.history = [h for h in state.history if h.get("id") != video.get("id")]
    state.history.insert(0, {
        "id": video.get("id"),
        "title": video.get("title"),
        "channel": video.get("channel"),
        "channel_id": video.get("channel_id"),
        "duration": video.get("duration"),
        "thumbnail": video.get("thumbnail")
                     or f"https://i.ytimg.com/vi/{video.get('id')}/hqdefault.jpg",
        "watched_at": time.time(),
    })
    # Il taglio va fatto anche in memoria, altrimenti la lista cresce senza
    # limite per tutta la vita del processo.
    del state.history[HISTORY_MAX:]
    _save_history(state)


def get_history(state, limit: int = 50) -> list:
    return state.history[:limit]


def remove_from_history(state, video_id: str) -> bool:
    """Toglie un singolo video dalla cronologia. False se non c'era."""
    prima = len(state.history)
    state.history = [h for h in state.history if h.get("id") != video_id]
    if len(state.history) == prima:
        return False
    _save_history(state)
    return True


def clear_history(state):
    state.history = []
    _save_history(state)
