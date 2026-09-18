"""channel_bubbles.py — bollicine dei canali attivi in home + "canale visto"."""
from fastapi import APIRouter

from auth import channel_bubbles
from auth.state import state

router = APIRouter()


@router.get("/api/feed/channel-bubbles")
async def channel_bubbles_feed(limit: int = 24):
    """
    Canali iscritti più attivi, per la riga di avatar in home.

    Risponde sempre 200, anche senza cookie e senza account collegato: in quel
    caso `channels` è vuoto e `source` vale "nessuna" — la home decide da sé se
    nascondere la riga. Legge solo le cache già presenti (vedi
    auth/channel_bubbles.py), quindi non fa mai partire un'estrazione.
    """
    return channel_bubbles.get_bubbles(state, max(1, min(limit, 50)))


@router.post("/api/channels/{channel_id}/seen")
async def mark_channel_seen(channel_id: str):
    """Spegne l'indicatore "nuovo" del canale (bollicina toccata o pagina canale aperta).

    `ok` false non è un errore: vuol dire che non c'era niente da marcare (nessun
    video noto per quel canale, o indicatore già spento).
    """
    return {"ok": channel_bubbles.mark_seen(state, channel_id)}
