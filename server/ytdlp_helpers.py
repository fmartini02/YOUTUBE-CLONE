"""ytdlp_helpers.py — opzioni base di yt-dlp ed esecuzione fuori dall'event loop."""
import asyncio
import shutil
from typing import Optional

from auth.cookie_session import crea_ydl

_NODE_PATH = shutil.which("node") or "/usr/bin/node"


def ydl_opts_base():
    return {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": True,
        "ignoreerrors": True,
        "js_runtimes": {"node": {"path": _NODE_PATH}},
        # Fa calcolare a yt-dlp una data approssimata (da testo tipo "2 giorni fa")
        # per ogni video nelle liste, senza richieste di rete aggiuntive: l'estrazione
        # "flat" usata per ricerca/home/abbonamenti normalmente non include upload_date,
        # e farlo con una extract_info completa per ogni card sarebbe troppo lento.
        "extractor_args": {"youtubetab": {"approximate_date": ["true"]}},
    }


async def in_executor(fn, *args):
    """
    Esegue codice bloccante fuori dall'event loop.

    yt-dlp e la lettura dei cookie dal browser sono sincroni e lenti (1-3
    secondi un'estrazione, minuti un download). Chiamarli dentro un `async def`
    ferma l'INTERO server per tutto quel tempo, perché FastAPI serve ogni
    richiesta sullo stesso event loop.
    """
    return await asyncio.get_running_loop().run_in_executor(None, fn, *args)


def _estrai_video(video_id: str, format_selector: Optional[str] = None) -> dict:
    """
    Estrazione completa di un singolo video. **Bloccante**: va sempre passata a
    `in_executor`, mai chiamata direttamente da un `async def`.

    `format_selector` serve solo a chi vuole anche un URL di riproduzione
    (/api/stream, /api/watch); i soli metadati non ne hanno bisogno.
    """
    opts = {**ydl_opts_base(), "extract_flat": False}
    if format_selector:
        opts["format"] = format_selector
    with crea_ydl(opts) as ydl:
        return ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
