"""subscriptions_actions.py — iscriversi/disiscriversi (Data API, scope di scrittura)."""
from auth.errors import YouTubeAPIError
from auth.subscriptions_state import forget_sub, remember_sub
from auth.yt_api import yt_api


async def subscribe(state, channel_id: str, name: str = "", thumbnail: str = "") -> dict:
    """
    Iscrive l'account collegato al canale e aggiorna la copia locale.

    `name`/`thumbnail` sono quelli che il frontend ha già sotto gli occhi:
    servono solo quando YouTube risponde 'sei già iscritto' (nessuno snippet
    nella risposta) e il canale manca dalla copia locale perché l'iscrizione
    è stata fatta altrove dopo l'ultima sincronizzazione.
    """
    snippet = {}
    try:
        data = await yt_api(state, "POST", "subscriptions", params={"part": "snippet"}, json_body={
            "snippet": {"resourceId": {"kind": "youtube#channel", "channelId": channel_id}},
        })
        snippet = data.get("snippet") or {}
    except YouTubeAPIError as e:
        # Già iscritto: non è un errore da mostrare, l'esito voluto c'è già.
        if e.reason != "subscriptionDuplicate":
            raise
    esistente = next((s for s in state.subs if s.get("id") == channel_id), {})
    entry = {
        "id": channel_id,
        "name": snippet.get("title") or esistente.get("name") or name or channel_id,
        "thumbnail": (snippet.get("thumbnails", {}).get("default") or {}).get("url")
                     or esistente.get("thumbnail") or thumbnail or None,
        "description": (snippet.get("description") or esistente.get("description") or "")[:100],
    }
    remember_sub(state, entry)
    return entry


async def unsubscribe(state, channel_id: str) -> bool:
    """
    Disiscrive l'account dal canale. True se YouTube aveva davvero
    un'iscrizione da cancellare.

    L'id da cancellare è quello dell'ISCRIZIONE, non del canale, e va chiesto
    a YouTube: chiederlo ogni volta (1 unità di quota) invece di salvarlo
    nella copia locale fa funzionare il pulsante anche per le iscrizioni
    fatte altrove e mai sincronizzate qui.
    """
    data = await yt_api(state, "GET", "subscriptions", params={
        "part": "id", "mine": "true", "forChannelId": channel_id, "maxResults": 1,
    })
    items = data.get("items") or []
    if items:
        await yt_api(state, "DELETE", "subscriptions", params={"id": items[0]["id"]})
    # La copia locale si ripulisce comunque: se YouTube non conosceva
    # quell'iscrizione, averla in elenco qui era già un errore.
    forget_sub(state, channel_id)
    return bool(items)
