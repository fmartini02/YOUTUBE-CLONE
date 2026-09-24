"""sponsorblock.py — segmenti SponsorBlock (sponsor, intro, outro…) di un video.

YTProxy toglie la pubblicità di YouTube ma non le sponsorizzazioni dentro il
video: quelle le segnala la comunità di SponsorBlock (sponsor.ajay.app, API
pubblica, senza chiave). Il player le salta o le colora sulla barra secondo le
preferenze (vedi components/VideoPlayer/sponsorBlock.js).

Perché passa dal server e non dal browser:
  - l'APK e la Smart TV stanno spesso su una rete solo-LAN senza DNS pubblico
    (CLAUDE.md, terza trappola dell'APK): `sponsor.ajay.app` da lì non si
    risolve, il server invece ha internet (lo usa per yt-dlp);
  - la cache è una sola per tutti i dispositivi di casa.

Privacy: si usa l'endpoint a prefisso di hash, `/api/skipSegments/<hash>`,
con i primi 4 caratteri dello SHA-256 dell'id. SponsorBlock risponde con i
segmenti di TUTTI i video che condividono il prefisso (decine) e il filtro
sull'id vero si fa qui: il loro server non sa quale video si sta guardando.

Fallimento silenzioso, di proposito: timeout breve e, su qualsiasi errore,
una lista vuota con `ok: false` e stato 200. Il player non aspetta questa
risposta per partire — i segmenti arrivano quando arrivano, o mai.
"""
import hashlib
import time
from collections import OrderedDict

import httpx
from fastapi import APIRouter, HTTPException

router = APIRouter()

_API = "https://sponsor.ajay.app/api/skipSegments/"
# Tutte le categorie "da saltare" note: il filtro per preferenza si fa nel
# frontend, così la cache non dipende dalle scelte dell'utente e cambiarle
# nelle Impostazioni non richiede una nuova richiesta.
_CATEGORIE = ["sponsor", "selfpromo", "interaction", "intro", "outro",
              "preview", "hook", "filler", "music_offtopic"]
# Solo `skip`: `mute` (silenziare un pezzo) e `full` (tutto il video è una
# sponsorizzazione) chiederebbero un comportamento diverso dal salto.
_PARAMS = {"categories": str(_CATEGORIE).replace("'", '"'), "actionTypes": '["skip"]'}
# Breve: la risposta non blocca la riproduzione, ma un segmento che arriva
# dopo 10s è già inutile se è un'intro. Il frontend ha il suo timeout sopra.
_TIMEOUT_S = 4
# I segmenti di un video cambiano (voti, nuovi invii nelle prime ore dopo la
# pubblicazione): trenta minuti bastano a non ripetere la richiesta a ogni
# riapertura, e un video nuovo prende i segmenti arrivati nel frattempo.
_TTL_S = 30 * 60
_CACHE_MAX = 500
_cache: "OrderedDict[str, tuple[float, list]]" = OrderedDict()
_client: httpx.AsyncClient = None


def _client_condiviso() -> httpx.AsyncClient:
    """Creato al primo uso, non all'import (vedi lo stesso in images.py)."""
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=_TIMEOUT_S, headers={"User-Agent": "YTProxy"})
    return _client


def _segmenti_del_video(dati, video_id: str) -> list:
    """Dalla risposta per prefisso tiene solo il video chiesto, nel formato che
    serve al player: inizio, fine, categoria, UUID (chiave per React)."""
    for voce in dati if isinstance(dati, list) else []:
        if voce.get("videoID") != video_id:
            continue
        segmenti = []
        for s in voce.get("segments", []):
            inizio, fine = (s.get("segment") or [0, 0])[:2]
            if s.get("actionType") == "skip" and fine > inizio:
                segmenti.append({"start": float(inizio), "end": float(fine),
                                 "category": s.get("category", ""), "uuid": s.get("UUID", "")})
        return sorted(segmenti, key=lambda x: x["start"])
    return []


async def _scarica(video_id: str) -> list:
    """Interroga SponsorBlock. 404 vuol dire "nessun segmento per il prefisso",
    non un errore; ogni altro problema solleva e NON finisce in cache."""
    prefisso = hashlib.sha256(video_id.encode()).hexdigest()[:4]
    r = await _client_condiviso().get(_API + prefisso, params=_PARAMS)
    if r.status_code == 404:
        return []
    r.raise_for_status()
    return _segmenti_del_video(r.json(), video_id)


@router.get("/api/sponsorblock/{video_id}")
async def segmenti_sponsorblock(video_id: str):
    """Segmenti SponsorBlock del video. `ok: false` = servizio non raggiungibile
    (lista vuota, il video si guarda lo stesso); `cached` solo per il collaudo."""
    if not (len(video_id) == 11 and all(c.isalnum() or c in "-_" for c in video_id)):
        raise HTTPException(400, "id video non valido")
    hit = _cache.get(video_id)
    if hit is not None and time.monotonic() - hit[0] < _TTL_S:
        _cache.move_to_end(video_id)
        return {"segments": hit[1], "ok": True, "cached": True}
    try:
        segmenti = await _scarica(video_id)
    except (httpx.HTTPError, ValueError, TypeError):
        return {"segments": [], "ok": False, "cached": False}
    _cache[video_id] = (time.monotonic(), segmenti)
    _cache.move_to_end(video_id)
    if len(_cache) > _CACHE_MAX:
        _cache.popitem(last=False)
    return {"segments": segmenti, "ok": True, "cached": False}
