"""channel_playlists.py — la scheda "Playlist" di un canale."""
import itertools

from auth.config import CHANNEL_PLAYLISTS_MAX
from auth.cookie_session import crea_ydl
from auth.cookies import get_cookie_path
from auth.playlist_mapping import is_playlist_entry, map_playlist_entry
from ytdlp.helpers import in_executor


def _estrai(url: str, opts: dict):
    """
    Metadati della scheda + le sue voci. **Bloccante** (vedi in_executor).

    Il generatore va consumato DENTRO il `with`: è pigro, e fuori l'istanza di
    yt-dlp è già chiusa. Con ignoreerrors un canale senza scheda Playlist dà
    None invece di un'eccezione.
    """
    with crea_ydl(opts) as ydl:
        info = ydl.extract_info(url, download=False, process=False) or {}
        voci = list(itertools.islice(iter(info.get("entries") or []), CHANNEL_PLAYLISTS_MAX))
    return info, voci


async def get_channel_playlists(channel_id: str, ydl_opts_base_fn) -> dict:
    """
    Le playlist pubblicate da un canale, in una sola estrazione.

    Niente LazyFeed: filtra e mappa le voci come video (id di 11 caratteri),
    quindi scarterebbe proprio le playlist. E non serve: anche i canali più
    grandi hanno qualche decina di playlist, non migliaia di video.
    """
    opts = {**ydl_opts_base_fn()}
    cookie_path = get_cookie_path()
    if cookie_path:
        opts["cookiefile"] = cookie_path
    url = f"https://www.youtube.com/channel/{channel_id}/playlists"
    try:
        info, voci = await in_executor(_estrai, url, opts)
    except Exception as e:
        print(f"[auth] Playlist del canale {channel_id} non leggibili: {e}")
        info, voci = {}, []

    nome = info.get("channel") or info.get("uploader")
    results = [map_playlist_entry(e, nome, channel_id) for e in voci if is_playlist_entry(e)]
    return {"results": results, "total": len(results)}
