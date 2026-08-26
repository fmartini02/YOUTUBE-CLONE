"""watch.py — metadati del video (pagina /watch) e sottotitoli."""
import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from ytdlp.helpers import _estrai_video, in_executor

router = APIRouter()

# YouTube traduce automaticamente in ~150 lingue: senza filtro il menu
# sarebbe illeggibile. Nomi leggibili per i codici lingua più comuni — il
# fallback (codice in maiuscolo) copre quelli rari.
_LANGUAGE_NAMES = {
    "it": "Italiano", "en": "Inglese", "en-US": "Inglese (US)", "en-GB": "Inglese (UK)",
    "es": "Spagnolo", "es-419": "Spagnolo (America Latina)", "pt": "Portoghese", "pt-BR": "Portoghese (Brasile)",
    "fr": "Francese", "de": "Tedesco", "ru": "Russo", "ja": "Giapponese", "ko": "Coreano",
    "zh-Hans": "Cinese (semplificato)", "zh-Hant": "Cinese (tradizionale)", "ar": "Arabo",
    "hi": "Hindi", "nl": "Olandese", "pl": "Polacco", "tr": "Turco", "sv": "Svedese",
    "el": "Greco", "cs": "Ceco", "ro": "Rumeno", "hu": "Ungherese", "uk": "Ucraino",
    "id": "Indonesiano", "vi": "Vietnamita", "th": "Thailandese", "fi": "Finlandese",
    "da": "Danese", "no": "Norvegese", "he": "Ebraico", "bg": "Bulgaro", "sk": "Slovacco",
    "hr": "Croato", "sr": "Serbo", "ca": "Catalano",
}


@router.get("/api/watch/{video_id}")
async def watch(video_id: str):
    """
    Metadati del video (titolo, canale, descrizione, durata...) per la pagina
    video. Nessun URL di stream: la riproduzione passa da /api/mux.
    """
    try:
        # yt-dlp è configurato con ignoreerrors, quindi un video non
        # estraibile (rimosso, privato...) dà `None` invece di sollevare.
        info = await in_executor(_estrai_video, video_id)
        if not info:
            raise HTTPException(404, "Video non trovato o non disponibile")
        return {
            "id": info.get("id"),
            "title": info.get("title"),
            "description": (info.get("description") or "")[:500],
            "channel": info.get("uploader"),
            "channel_id": info.get("channel_id"),
            "duration": info.get("duration"),
            "views": info.get("view_count"),
            "likes": info.get("like_count"),
            "thumbnail": f"https://i.ytimg.com/vi/{video_id}/maxresdefault.jpg",
            "published": info.get("upload_date"),
            "tags": info.get("tags", [])[:10],
        }
    except HTTPException:
        raise
    except Exception as ex:
        raise HTTPException(500, str(ex))


def _subtitle_tracks(info: dict) -> dict:
    """Unione sottotitoli manuali (priorità, se presenti) + automatici, solo lingue con formato vtt."""
    subs = info.get("subtitles") or {}
    auto = info.get("automatic_captions") or {}
    merged = {}
    for lang in set(subs) | set(auto):
        tracks = subs.get(lang) or auto.get(lang) or []
        if any(t.get("ext") == "vtt" for t in tracks):
            merged[lang] = {"tracks": tracks, "auto": lang not in subs}
    return merged


@router.get("/api/subtitles/{video_id}")
async def list_subtitles(video_id: str):
    """Lingue sottotitoli disponibili per il video (quasi sempre solo automatici)."""
    try:
        info = await in_executor(_estrai_video, video_id) or {}
        merged = _subtitle_tracks(info)
        languages = sorted(
            [
                {"code": lang, "name": _LANGUAGE_NAMES.get(lang, lang), "auto": v["auto"]}
                for lang, v in merged.items()
                if lang in _LANGUAGE_NAMES or not v["auto"]
            ],
            key=lambda x: (x["auto"], x["name"]),
        )
        return {"languages": languages}
    except Exception as ex:
        return {"languages": [], "error": str(ex)}


@router.get("/api/subtitles/{video_id}/{lang}.vtt")
async def get_subtitle_vtt(video_id: str, lang: str):
    """Proxy del sottotitolo WebVTT — evita problemi di CORS puntando il <track> direttamente a YouTube."""
    try:
        info = await in_executor(_estrai_video, video_id) or {}
        merged = _subtitle_tracks(info)
        entry = merged.get(lang)
        if not entry:
            raise HTTPException(404, "Lingua non disponibile per questo video")
        url = next(t["url"] for t in entry["tracks"] if t.get("ext") == "vtt")
        async with httpx.AsyncClient() as client:
            r = await client.get(url, timeout=15)
            r.raise_for_status()
        return Response(content=r.content, media_type="text/vtt")
    except HTTPException:
        raise
    except Exception as ex:
        raise HTTPException(500, str(ex))
