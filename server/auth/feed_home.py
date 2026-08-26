"""feed_home.py — la home reale di YouTube (raccomandazioni, richiede i cookie)."""
from auth.config import FEED_CHUNK, FEED_MAX
from auth.cookies import get_cookie_path, get_cookie_status
from auth.feed_pager import FeedPageRequest, lazy_page


async def get_home_feed_page(state, offset: int, limit: int, ydl_opts_base_fn) -> dict:
    """
    Una pagina della home di YouTube: le tue raccomandazioni reali.

    Servono i cookie di una sessione YouTube loggata — non esiste altro modo
    di ottenere le raccomandazioni personali. Ritorna
    {"results", "total", "has_more", "reason"}; `reason` dice al frontend
    *perché* il feed è vuoto, così può spiegarlo invece di mostrare
    qualcos'altro al posto della home.
    """
    cookie_path = get_cookie_path()
    if not cookie_path:
        return {"results": [], "total": 0, "has_more": False, "reason": "no-cookies"}
    if not get_cookie_status().get("logged_in"):
        return {"results": [], "total": 0, "has_more": False, "reason": "not-logged-in"}

    # refill: YouTube chiude le continuazioni della home dopo poche centinaia
    # di video, ma riaprendo il feed ne dà altri (vedi lazy_feed._rigenera).
    req = FeedPageRequest(
        key="home", url="https://www.youtube.com/feed/recommended",
        offset=offset, limit=limit,
        opts={**ydl_opts_base_fn(), "cookiefile": cookie_path},
        chunk=FEED_CHUNK, cap=FEED_MAX, refill=True,
    )
    page = await lazy_page(state, req)
    if not page["total"]:
        # Cookie presenti e in apparenza validi, ma YouTube non ha dato
        # nulla: di solito la sessione è scaduta e va reimportata.
        page["reason"] = "feed-vuoto"
    return page
