"""images.py — proxy per le immagini di YouTube (miniature e loghi canale).

Perché serve: l'APK e la Smart TV stanno spesso su una rete solo-LAN, senza
DNS pubblico. `i.ytimg.com` e `yt3.ggpht.com` non si risolvono e le miniature
restano vuote, i loghi diventano l'iniziale del nome. Il server invece ha
internet (lo usa già per yt-dlp), quindi riscarica lui l'immagine e la rimanda
sulla LAN. Non è un proxy aperto: passa solo un elenco di host di YouTube.

Sta fuori da feeds.py perché quel file è già a 5 funzioni (CLAUDE.md).

Tre ottimizzazioni per la home/i feed, che caricano decine di miniature in
un colpo solo (uno dei sospetti principali di "l'app è lenta a caricare"):
un `httpx.AsyncClient` MODULARE invece di uno nuovo per ogni richiesta (senza,
ogni miniatura pagava un handshake TLS proprio verso Google invece di
riusare le connessioni keep-alive già aperte); una cache LRU in memoria
delle immagini già scaricate (`_cache`), così un rewind sulla home o due
schede diverse sullo stesso canale non ripetono la stessa richiesta esterna
(solo in RAM, niente `data/`: si svuota a ogni riavvio, come `_mux_fmt_cache`
di streaming.py — le miniature cambiano raramente ma non conviene inseguirle);
e una deduplica delle richieste concorrenti (`_in_volo`) per lo stesso URL
non ancora in cache — senza, il logo di un canale che compare su molte righe
dello stesso feed arriva tutto insieme al primo caricamento e la cache, da
sola, non aiuta affatto: nessuna delle richieste in corso vede ancora
l'altra, quindi le manca tutte allo stesso modo.
"""
import asyncio
from collections import OrderedDict
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

router = APIRouter()

# Sottodomini di YouTube/Google che servono miniature e avatar. Il confronto
# è sul suffisso ("i9.ytimg.com".endswith("ytimg.com")), quindi copre tutte
# le shard numerate senza elencarle.
_HOST_CONSENTITI = ("ytimg.com", "ggpht.com", "googleusercontent.com", "youtube.com")

# Connessioni riusate fra tutte le richieste (keep-alive verso Google) invece
# di aprirne una nuova ogni volta: creato al primo uso, non all'import, per
# non legare un event loop al modulo prima che uvicorn lo avvii davvero.
_client: httpx.AsyncClient = None

# Cache LRU: al massimo _CACHE_MAX immagini, la più vecchia (per uso, non per
# inserimento: ogni hit la sposta in fondo) sfrattata per prima. Una miniatura
# è tipicamente 10-30KB: 300 voci restano sotto una decina di MB.
_CACHE_MAX = 300
_cache: "OrderedDict[str, tuple[bytes, str]]" = OrderedDict()

# Un Future per URL con un fetch già in corso: una seconda richiesta per lo
# stesso URL non ancora in cache aspetta il risultato di questo invece di
# aprirne uno identico.
_in_volo: dict = {}


def _client_condiviso() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(follow_redirects=True, timeout=10)
    return _client


async def _scarica(u: str) -> tuple:
    """Scarica `u` una sola volta anche se richiesto in concorrenza: chi
    trova già un fetch in corso per lo stesso URL ne aspetta il risultato
    invece di farne partire un altro."""
    attesa = _in_volo.get(u)
    if attesa is not None:
        return await attesa
    futuro = asyncio.get_running_loop().create_future()
    _in_volo[u] = futuro
    errore = None
    try:
        r = await _client_condiviso().get(u, headers={"User-Agent": "Mozilla/5.0"})
        if r.status_code != 200:
            errore = HTTPException(502, "immagine non disponibile")
    except httpx.HTTPError:
        errore = HTTPException(502, "immagine non raggiungibile")
    _in_volo.pop(u, None)
    if errore:
        futuro.set_exception(errore)
        raise errore
    risultato = (r.content, r.headers.get("content-type", "image/jpeg"))
    futuro.set_result(risultato)
    return risultato


@router.get("/api/img")
async def proxy_immagine(u: str):
    """Riscarica `u` (una miniatura/avatar di YouTube) e la rimanda intatta."""
    host = (urlparse(u).hostname or "").lower()
    if not host.endswith(_HOST_CONSENTITI):
        raise HTTPException(400, "host non consentito")

    hit = _cache.get(u)
    if hit is not None:
        _cache.move_to_end(u)
        content, content_type = hit
    else:
        content, content_type = await _scarica(u)
        _cache[u] = (content, content_type)
        if len(_cache) > _CACHE_MAX:
            _cache.popitem(last=False)

    return Response(
        content=content,
        media_type=content_type,
        # Un giorno di cache anche lato browser: le miniature non cambiano e
        # così un rewind sulla pagina non le richiede nemmeno al proxy.
        headers={"Cache-Control": "public, max-age=86400"},
    )
