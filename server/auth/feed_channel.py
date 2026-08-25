"""feed_channel.py — scheda 'Video' di un canale, con intestazione."""
from auth.config import CHANNEL_CHUNK, CHANNEL_MAX
from auth.cookies import get_cookie_path
from auth.feed_pager import FeedPageRequest, lazy_page
from auth.mapping import channel_meta


async def get_channel_page(state, channel_id: str, offset: int, limit: int, ydl_opts_base_fn) -> dict:
    """
    Una pagina della scheda "Video" di un canale, più l'intestazione.

    I cookie non servono (un canale è pubblico) ma se ci sono si usano lo
    stesso, altrimenti YouTube tratta la sessione come anonima e in certi
    casi chiede la verifica dell'età.
    """
    opts = {**ydl_opts_base_fn()}
    cookie_path = get_cookie_path()
    if cookie_path:
        opts["cookiefile"] = cookie_path

    req = FeedPageRequest(key=f"channel:{channel_id}",
                          url=f"https://www.youtube.com/channel/{channel_id}/videos",
                          offset=offset, limit=limit, opts=opts,
                          chunk=CHANNEL_CHUNK, cap=CHANNEL_MAX, with_info=True)
    page = await lazy_page(state, req)
    info = page.pop("info", {}) or {}
    meta = channel_meta(info, channel_id)

    # Nella scheda di un canale yt-dlp non ripete l'autore su ogni voce (è
    # implicito): senza questo le card uscirebbero senza nome canale.
    for v in page["results"]:
        v["channel"] = v.get("channel") or meta["name"]
        v["channel_id"] = v.get("channel_id") or meta["id"]

    page["channel"] = meta
    if not page["total"]:
        page["reason"] = "canale-non-trovato" if not meta["name"] else "nessun-video"
    return page
