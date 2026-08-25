"""comment_posting.py — pubblicare commenti e risposte (scope di scrittura)."""
from auth.comments import map_api_comment
from auth.yt_api import yt_api


async def post_comment(state, video_id: str, text: str) -> dict:
    """Pubblica un commento principale sul video."""
    data = await yt_api(state, "POST", "commentThreads", params={"part": "snippet"}, json_body={
        "snippet": {"videoId": video_id, "topLevelComment": {"snippet": {"textOriginal": text}}},
    })
    top = (data.get("snippet") or {}).get("topLevelComment") or {}
    return map_api_comment(top.get("snippet", {}), top.get("id") or data.get("id"))


async def post_reply(state, parent_id: str, text: str) -> dict:
    """Pubblica una risposta a un commento esistente."""
    data = await yt_api(state, "POST", "comments", params={"part": "snippet"}, json_body={
        "snippet": {"parentId": parent_id, "textOriginal": text},
    })
    return map_api_comment(data.get("snippet", {}), data.get("id"))
