"""
comments.py — lettura commenti tramite la YouTube Data API v3.

Per la sola lettura yt-dlp basterebbe, ma restituisce i commenti in blocco
(nessuna continuazione riutilizzabile fra una richiesta e l'altra). Con
l'account collegato usiamo quindi la Data API: ha una paginazione vera
(nextPageToken), quindi "carica altri commenti" è una richiesta piccola
invece di ri-scaricare tutto, e le risposte ai thread si possono chiedere
solo quando servono. Costo quota: 1 unità a lettura (su 10.000/giorno).
"""
from auth.mapping import _iso_to_timestamp
from auth.yt_api import yt_api


def map_api_comment(snippet: dict, comment_id: str, extra: dict = None) -> dict:
    """Commento della Data API → stessa forma di quelli estratti da yt-dlp."""
    out = {
        "id": comment_id,
        "text": snippet.get("textOriginal") or snippet.get("textDisplay") or "",
        "author": snippet.get("authorDisplayName"),
        "author_thumbnail": snippet.get("authorProfileImageUrl"),
        "author_channel_id": (snippet.get("authorChannelId") or {}).get("value"),
        "author_is_uploader": False,  # riempito da chi conosce il canale del video
        "likes": snippet.get("likeCount") or 0,
        "published": _iso_to_timestamp(snippet.get("publishedAt")),
        "reply_count": 0,
    }
    if extra:
        out.update(extra)
    return out


async def get_video_comment_count(state, video_id: str):
    """Numero totale di commenti del video (statistiche della Data API)."""
    try:
        data = await yt_api(state, "GET", "videos", params={"part": "statistics", "id": video_id})
        items = data.get("items") or []
        if items:
            n = (items[0].get("statistics") or {}).get("commentCount")
            return int(n) if n is not None else None
    except Exception as e:
        print(f"[auth] comment count: {e}")
    return None


async def list_comment_threads(state, video_id: str, sort: str, page_token: str = "", limit: int = 40) -> dict:
    """Una pagina di commenti principali + il token per la successiva (vuoto = finiti)."""
    params = {
        "part": "snippet",
        "videoId": video_id,
        "order": "time" if sort == "new" else "relevance",
        "maxResults": max(1, min(limit, 100)),
        "textFormat": "plainText",
    }
    if page_token:
        params["pageToken"] = page_token
    data = await yt_api(state, "GET", "commentThreads", params=params)
    comments = []
    for item in data.get("items", []):
        sn = item.get("snippet", {})
        top = sn.get("topLevelComment", {})
        comments.append(map_api_comment(
            top.get("snippet", {}),
            top.get("id") or item.get("id"),
            {"reply_count": sn.get("totalReplyCount") or 0},
        ))
    # pageInfo.totalResults di commentThreads è il numero di risultati della
    # PAGINA, non del video: per il totale vero serve la scheda statistiche,
    # chiesta una volta sola (prima pagina).
    total = None
    if not page_token:
        total = await get_video_comment_count(state, video_id)
    return {"comments": comments, "next_page_token": data.get("nextPageToken", ""), "total": total}


async def list_comment_replies(state, parent_id: str, page_token: str = "", limit: int = 50) -> dict:
    """Risposte a un commento — caricate solo quando l'utente le apre."""
    params = {
        "part": "snippet",
        "parentId": parent_id,
        "maxResults": max(1, min(limit, 100)),
        # Senza questo la API restituisce HTML (<br>, &quot;, link <a>) che
        # React stamperebbe alla lettera dentro il testo del commento.
        "textFormat": "plainText",
    }
    if page_token:
        params["pageToken"] = page_token
    data = await yt_api(state, "GET", "comments", params=params)
    replies = [
        map_api_comment(item.get("snippet", {}), item.get("id"))
        for item in data.get("items", [])
    ]
    # La API le dà dalla più vecchia alla più recente: è l'ordine di lettura.
    return {"comments": replies, "next_page_token": data.get("nextPageToken", "")}
