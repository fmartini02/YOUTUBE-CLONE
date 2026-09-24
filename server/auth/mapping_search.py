"""
mapping_search.py — voce di una ricerca di yt-dlp -> card del frontend.

A differenza di `ytsearchN:` (solo video), la pagina dei risultati di YouTube
mescola video, canali e playlist. Ogni voce esce con un campo `kind`
(`video` / `channel` / `playlist`) che dice al frontend quale card usare.

Come si riconoscono (voci "flat" di yt-dlp):
  - video: id di 11 caratteri (`is_video_entry`), ie_key `Youtube`;
  - canale: ie_key `YoutubeTab`, id `UC…`;
  - playlist: ie_key `YoutubeTab`, URL `playlist?list=`. I Mix (id `RD…`,
    tranne le `RDCLAK…`) si scartano come negli altri feed: sono generati al
    volo e non si aprono.
"""
import re
from typing import Optional

from auth.mapping import is_video_entry, map_video_entry

# La copertina di una playlist è la miniatura di un suo video: dall'URL
# (i.ytimg.com/vi/<id>/…) si ricava quale.
_VIDEO_IN_MINIATURA = re.compile(r"/vi/([A-Za-z0-9_-]{11})/")


def _miniatura_grande(e: dict) -> Optional[str]:
    """
    La miniatura più larga, con lo schema: i loghi dei canali piccoli arrivano
    come `//yt3.ggpht.com/…`, che il proxy /api/img non saprebbe scaricare.
    """
    thumbs = [t for t in (e.get("thumbnails") or []) if t.get("url")]
    if not thumbs:
        return None
    url = max(thumbs, key=lambda t: t.get("width") or 0)["url"]
    return "https:" + url if url.startswith("//") else url


def _map_channel(e: dict) -> dict:
    """Card di un canale: logo, handle, iscritti e l'inizio della descrizione."""
    return {
        "kind": "channel",
        "id": e.get("channel_id") or e.get("id"),
        "name": e.get("channel") or e.get("title"),
        "handle": e.get("uploader_id"),
        "avatar": _miniatura_grande(e),
        "subscribers": e.get("channel_follower_count"),
        "description": e.get("description"),
        "verified": bool(e.get("channel_is_verified")),
    }


def _map_playlist(e: dict) -> dict:
    """
    Card di una playlist. yt-dlp nella ricerca non dà il numero di video;
    dà però la copertina, e con lei `video_id`: il video che la playlist
    mostra in copertina. La card del frontend apre la pagina playlist
    (`id`); `video_id` resta come informazione in più.
    """
    thumb = _miniatura_grande(e)
    trovato = _VIDEO_IN_MINIATURA.search(thumb or "")
    return {
        "kind": "playlist",
        "id": e.get("id"),
        "title": e.get("title"),
        "channel": e.get("channel") or e.get("uploader"),
        "channel_id": e.get("channel_id"),
        "thumbnail": thumb,
        "video_id": trovato.group(1) if trovato else None,
    }


def map_search_entry(e: dict) -> Optional[dict]:
    """Voce grezza -> card con `kind`, oppure None se è da scartare (Mix, voci sconosciute)."""
    if not e:
        return None
    if is_video_entry(e):
        return {"kind": "video", **map_video_entry(e)}
    vid = e.get("id") or ""
    if vid.startswith("UC"):
        return _map_channel(e)
    # RDCLAK… sono le playlist curate di YouTube Music: iniziano per RD ma
    # sono stabili come le PL…, non Mix generati al volo.
    if "list=" in (e.get("url") or "") and (not vid.startswith("RD") or vid.startswith("RDCLAK")):
        return _map_playlist(e)
    return None
