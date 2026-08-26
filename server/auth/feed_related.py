"""feed_related.py — video correlati: Mix di YouTube, con ripiego a ricerca."""
import asyncio

from auth.config import RELATED_CHUNK, RELATED_MAX, RELATED_SEARCH_MAX
from auth.cookie_session import crea_ydl
from auth.cookies import get_cookie_path
from auth.feed_pager import FeedPageRequest, lazy_page


async def get_related_page(state, video_id: str, offset: int, limit: int, ydl_opts_base_fn) -> dict:
    """
    Una pagina di video correlati, presi dal "Mix" di YouTube (playlist
    RD<id>): è la lista che YouTube stessa costruisce a partire da un video,
    e si estende con continuazioni praticamente senza fine — quindi regge lo
    scroll infinito, al contrario di una ricerca per titolo.
    """
    opts = {**ydl_opts_base_fn()}
    cookie_path = get_cookie_path()
    if cookie_path:
        opts["cookiefile"] = cookie_path
    url = f"https://www.youtube.com/watch?v={video_id}&list=RD{video_id}"
    # escludi: il primo elemento del Mix è il video di partenza, fuori posto
    # in una lista di "correlati".
    req = FeedPageRequest(key=f"related:{video_id}", url=url, offset=offset, limit=limit,
                          opts=opts, chunk=RELATED_CHUNK, cap=RELATED_MAX, escludi=video_id)
    page = await lazy_page(state, req)

    # Non tutti i video hanno un Mix: YouTube non lo genera per i video poco
    # visti o dei canali piccoli, e lì yt-dlp avvisa "Unable to recognize
    # playlist" e ricade sul solo video di partenza.
    if not page["total"]:
        return await _related_by_search(state, video_id, offset, limit, opts)

    # Dalla seconda pagina in poi il feed aperto può già essere quello del
    # ripiego: l'etichetta va letta da lì, non data per scontata.
    page["source"] = _related_source(state, video_id)
    return page


def _related_source(state, video_id: str) -> str:
    """"mix" o "ricerca", secondo il feed effettivamente aperto per questo video."""
    feed = state.feeds.get(f"related:{video_id}")
    return "ricerca" if feed is not None and feed.url.startswith("ytsearch") else "mix"


async def _related_by_search(state, video_id: str, offset: int, limit: int, opts: dict) -> dict:
    """
    Ripiego quando il Mix non esiste: una ricerca sul titolo del video.

    Meno "personale" del Mix e non infinita, ma per un video di nicchia i
    risultati sono quasi sempre a tema — molto meglio di una colonna vuota.
    """
    title = await _video_title(video_id, opts)
    if not title:
        return {"results": [], "total": 0, "has_more": False, "source": "nessuna"}

    req = FeedPageRequest(key=f"related:{video_id}", url=f"ytsearch{RELATED_SEARCH_MAX}:{title}",
                          offset=offset, limit=limit, opts=opts, chunk=RELATED_CHUNK,
                          cap=RELATED_SEARCH_MAX, escludi=video_id)
    page = await lazy_page(state, req)
    page["source"] = "ricerca"
    return page


async def _video_title(video_id: str, opts: dict):
    """Titolo di un video, al costo più basso possibile (process=False)."""
    def _estrai():
        with crea_ydl(opts) as ydl:
            return ydl.extract_info(
                f"https://www.youtube.com/watch?v={video_id}", download=False, process=False,
            )
    try:
        loop = asyncio.get_event_loop()
        info = await loop.run_in_executor(None, _estrai)
        return (info or {}).get("title")
    except Exception as e:
        print(f"[auth] Titolo non recuperabile per {video_id}: {e}")
        return None
