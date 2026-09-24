"""feed_playlist.py — una playlist di YouTube, a pagine, con intestazione."""
from auth.config import PLAYLIST_CHUNK, PLAYLIST_MAX
from auth.cookies import get_cookie_path
from auth.feed_pager import FeedPageRequest, lazy_page
from auth.playlist_mapping import playlist_meta


async def get_playlist_page(state, playlist_id: str, offset: int, limit: int, ydl_opts_base_fn) -> dict:
    """
    Una pagina dei video di una playlist, più l'intestazione in `playlist`
    (titolo, autore, numero di video): stesso schema della pagina canale (vedi
    feed_channel.py), con lo stesso LazyFeed — una playlist lunga arriva a
    blocchi di 100 da YouTube, e scorrendo si scarica solo quello che serve.

    I cookie non servono per una playlist pubblica, ma se ci sono si usano: le
    playlist "non in elenco" o con video soggetti a limiti d'età altrimenti
    tornano vuote.

    I video privati o eliminati non arrivano (vedi mapping.is_video_entry):
    `total` e `playlist.count` possono quindi differire, il secondo è quello
    dichiarato da YouTube.
    """
    opts = {**ydl_opts_base_fn()}
    cookie_path = get_cookie_path()
    if cookie_path:
        opts["cookiefile"] = cookie_path

    req = FeedPageRequest(key=f"playlist:{playlist_id}",
                          url=f"https://www.youtube.com/playlist?list={playlist_id}",
                          offset=offset, limit=limit, opts=opts,
                          chunk=PLAYLIST_CHUNK, cap=PLAYLIST_MAX, with_info=True)
    page = await lazy_page(state, req)
    info = page.pop("info", {}) or {}
    primo = page["results"][0] if page["results"] else None
    meta = playlist_meta(info, playlist_id, primo)

    page["playlist"] = meta
    if not page["total"]:
        page["reason"] = "playlist-non-trovata" if not meta["title"] else "playlist-vuota"
    return page
