"""
playlist_mapping.py — metadati di una playlist e voci "playlist" (scheda del
canale, ricerca) nel formato usato dal frontend.

Separato da mapping.py, che è già alle 5 funzioni per file (vedi CLAUDE.md).
"""


def _miniatura_grande(thumbs) -> str:
    """L'URL della miniatura più larga, o None."""
    scelte = [t for t in (thumbs or []) if t.get("url")]
    if not scelte:
        return None
    return max(scelte, key=lambda t: t.get("width") or 0)["url"]


def is_playlist_entry(e) -> bool:
    """
    Una voce che rimanda a una playlist: nella scheda Playlist di un canale e
    nei risultati di ricerca filtrati per playlist yt-dlp dà voci `url` verso
    /playlist?list=<id>. I canali o i video eventualmente mescolati si scartano.
    """
    e = e or {}
    return bool(e.get("id")) and "list=" in (e.get("url") or "")


def map_playlist_entry(e: dict, channel: str = None, channel_id: str = None) -> dict:
    """
    Voce playlist grezza → card del frontend.

    Nella scheda Playlist di un canale yt-dlp mette come autore il testo del
    link ("View full playlist") e nessun id canale: in quel caso vale il canale
    della scheda, passato da chi chiama. I risultati di ricerca invece hanno
    l'autore vero, con il suo id.
    """
    proprio = e.get("channel_id")
    return {
        "id": e.get("id"),
        "title": e.get("title"),
        "thumbnail": _miniatura_grande(e.get("thumbnails")),
        "channel": (e.get("channel") or e.get("uploader")) if proprio else channel,
        "channel_id": proprio or channel_id,
        "count": e.get("playlist_count"),
    }


def playlist_meta(info: dict, playlist_id: str, primo: dict = None) -> dict:
    """
    Intestazione della pagina playlist, dai metadati dell'estrazione — arrivano
    con la prima richiesta, come quelli del canale (vedi LazyFeed.info).

    `primo` è il primo video della lista: se YouTube non dà una copertina per
    la playlist si usa la sua, come fa YouTube stessa.
    """
    thumb = _miniatura_grande(info.get("thumbnails")) or (primo or {}).get("thumbnail")
    return {
        "id": info.get("id") or playlist_id,
        "title": info.get("title"),
        "channel": info.get("channel") or info.get("uploader"),
        "channel_id": info.get("channel_id"),
        "count": info.get("playlist_count"),
        "views": info.get("view_count"),
        "updated": info.get("modified_date"),
        "description": info.get("description") or "",
        "thumbnail": thumb,
    }
