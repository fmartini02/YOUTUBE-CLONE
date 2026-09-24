"""playlists.py — una playlist a pagine, e la scheda Playlist di un canale."""
import re

from fastapi import APIRouter, HTTPException

from auth import channel_playlists, feed_playlist, watch_later
from auth.state import state
from ytdlp.helpers import ydl_opts_base

router = APIRouter()

# Gli id di playlist di YouTube (PL…, UU…, OLAK…, RD…, WL) sono di questo
# alfabeto. Il controllo non è estetico: l'id finisce dentro un URL passato a
# yt-dlp, e con un "&" o un "/" si potrebbe fargli estrarre altro.
_ID_VALIDO = re.compile(r"^[A-Za-z0-9_-]{2,64}$")


@router.get("/api/playlist/{playlist_id}")
async def playlist(playlist_id: str, limit: int = 50, offset: int = 0):
    """
    Video di una playlist, a pagine, più l'intestazione in `playlist` (titolo,
    autore, numero di video). `WL` è la coda locale "Guarda più tardi" (vedi
    auth/watch_later.py), non quella dell'account YouTube.
    """
    if not _ID_VALIDO.match(playlist_id):
        raise HTTPException(400, "Id di playlist non valido")
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    if playlist_id == watch_later.WATCH_LATER_ID:
        return watch_later.watch_later_page(state, offset, limit)
    return await feed_playlist.get_playlist_page(state, playlist_id, offset, limit, ydl_opts_base)


@router.get("/api/channel/{channel_id}/playlists")
async def channel_playlists_endpoint(channel_id: str):
    """La scheda "Playlist" di un canale: titolo, copertina e id di ognuna."""
    if not _ID_VALIDO.match(channel_id):
        raise HTTPException(400, "Id di canale non valido")
    return await channel_playlists.get_channel_playlists(channel_id, ydl_opts_base)
