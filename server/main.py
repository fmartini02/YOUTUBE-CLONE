import asyncio
import json
import os
import re
import tempfile
import time
import urllib.parse
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import httpx

# crea_ydl al posto di yt_dlp.YoutubeDL: stessa istanza, ma incapace di
# cancellare la sessione da cookies.txt quando chiude (vedi il suo docstring).
from auth import auth_manager, crea_ydl, is_video_entry, YouTubeAPIError
from sync import scheduler
from ytdlp_patch import applica_patch_collaborazioni

# Va applicata prima di qualsiasi estrazione: recupera l'id del canale nelle card
# dei video in collaborazione, che altrimenti restano senza logo e non cliccabili.
applica_patch_collaborazioni()

app = FastAPI(title="YTProxy")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DOWNLOAD_DIR = Path(tempfile.gettempdir()) / "ytproxy_cache"
DOWNLOAD_DIR.mkdir(exist_ok=True)

# Porta del server: deve combaciare con vite.config.js (proxy /api), start_server.sh/.bat
# ed electron/main.js.
SERVER_PORT = int(os.environ.get("YTPROXY_PORT", 8090))
# Vecchio flow web, tenuto solo per chi ha già collegato un client "Applicazione
# web": vale unicamente col server sulla stessa macchina del browser, perché
# Google come redirect http accetta solo localhost e non gli IP privati. Il
# login nuovo passa dal device flow (/api/auth/device/*), che di redirect non ne
# ha e quindi funziona anche col server su un altro computer della rete.
OAUTH_REDIRECT_URI = f"http://localhost:{SERVER_PORT}/api/auth/callback-page"

# ─── YouTube Data API (no key needed: scraping via yt-dlp) ───────────────────

import shutil as _shutil
import time as _time
_NODE_PATH = _shutil.which("node") or "/usr/bin/node"

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


def _timestamp_to_upload_date(ts) -> Optional[str]:
    """Converte un unix timestamp (anche approssimato) nel formato YYYYMMDD usato da 'published'."""
    if not ts:
        return None
    from datetime import datetime, timezone
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y%m%d")


_QUALITY_HEIGHTS = {"1080": 1080, "720": 720, "480": 480, "360": 360}

# Nomi leggibili per i codici lingua più comuni dei sottotitoli — YouTube ne
# offre ~150, il fallback (codice in maiuscolo) copre quelli rari.
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


def _progressive_format_selector(quality: str) -> str:
    """
    Un solo file con video+audio uniti: obbligatorio per il player <video> del
    browser, che non può riprodurre due URL separati (video-only + audio-only)
    come fa VLC. Senza il filtro acodec/vcodec!=none yt-dlp a volte sceglie il
    formato adattivo migliore (solo video) e il player parte muto.
    """
    h = _QUALITY_HEIGHTS.get(quality)
    height_filter = f"[height<={h}]" if h else ""
    return (
        f"best{height_filter}[acodec!=none][vcodec!=none]"
        f"/best[acodec!=none][vcodec!=none]/best"
    )


def _adaptive_format_selector(quality: str) -> str:
    """
    Coppia video+audio separati alla qualità più alta disponibile (YouTube
    quasi mai offre un unico file combinato oltre i 360p — vedi
    _progressive_format_selector). Usata da /api/mux, che li ricompone al
    volo con ffmpeg.
    """
    h = _QUALITY_HEIGHTS.get(quality, 1080)
    return f"bestvideo[height<={h}]+bestaudio/best[height<={h}]/best"


def _cast_format_selector(quality: str) -> str:
    """
    Formati per il Chromecast: H.264 (avc1) + AAC (mp4a).

    Il selettore normale prende il meglio in assoluto, che oggi su YouTube
    significa video AV1 e audio Opus: nessun Chromecast tranne i modelli più
    recenti sa decodificare AV1, e Opus dentro un contenitore MP4 è supportato
    male ovunque — il risultato è che la TV non riproduce nulla. H.264+AAC sono
    invece decodificati da qualunque dispositivo Cast, e su YouTube arrivano
    comunque fino a 1080p.
    """
    h = _QUALITY_HEIGHTS.get(quality, 1080)
    return (
        f"bestvideo[height<={h}][vcodec^=avc1]+bestaudio[acodec^=mp4a]"
        f"/best[height<={h}][vcodec^=avc1][acodec^=mp4a]"
        f"/best[height<={h}]"
    )


@app.get("/api/search")
async def search(q: str = Query(...), page: int = 1):
    """Search YouTube videos."""
    try:
        # ytsearchN chiede N risultati TOTALI: per la pagina 2 servono 40
        # risultati da cui prendere il secondo blocco. Prima era fisso a
        # ytsearch20 con playlist_items 21-40 — una fetta oltre la fine della
        # lista, quindi la pagina 2 tornava sempre vuota.
        per_page = 20
        want = page * per_page
        opts = {
            **ydl_opts_base(),
            "playlist_items": f"{(page - 1) * per_page + 1}-{want}",
        }
        with crea_ydl(opts) as ydl:
            info = ydl.extract_info(f"ytsearch{want}:{q}", download=False)
            entries = info.get("entries", [])
            results = []
            for e in entries:
                if not is_video_entry(e):
                    continue
                results.append({
                    "id": e.get("id"),
                    "title": e.get("title"),
                    "channel": e.get("uploader") or e.get("channel"),
                    "channel_id": e.get("channel_id"),
                    "duration": e.get("duration"),
                    "views": e.get("view_count"),
                    "thumbnail": f"https://i.ytimg.com/vi/{e.get('id')}/hqdefault.jpg",
                    "published": _timestamp_to_upload_date(e.get("timestamp")),
                })
            return {"results": results, "query": q, "has_more": len(results) >= per_page}
    except Exception as ex:
        raise HTTPException(500, str(ex))


_trending_cache: list = []
_trending_cache_at: float = 0
_TRENDING_CACHE_TTL = 600  # 10 minuti


@app.get("/api/trending")
async def trending(limit: int = 24, offset: int = 0):
    """
    Trending — fallback della home quando non ci sono i cookie.
    Paginato per lo scroll infinito, con cache in memoria: le pagine
    successive vengono servite dallo stesso elenco già estratto.
    """
    global _trending_cache, _trending_cache_at
    import time as _time

    def _page(results):
        return {
            "results": results[offset:offset + limit],
            "total": len(results),
            "has_more": offset + limit < len(results),
        }

    if _trending_cache and _time.time() - _trending_cache_at < _TRENDING_CACHE_TTL:
        return _page(_trending_cache)

    try:
        opts = {
            **ydl_opts_base(),
            "playlistend": 120,
        }
        with crea_ydl(opts) as ydl:
            info = ydl.extract_info("https://www.youtube.com/results?search_query=trending+italia&sp=CAISAhAB", download=False)
            entries = (info or {}).get("entries", [])
            results = []
            for e in entries:
                if not is_video_entry(e):
                    continue
                results.append({
                    "id": e.get("id"),
                    "title": e.get("title"),
                    "channel": e.get("uploader") or e.get("channel"),
                    "channel_id": e.get("channel_id"),
                    "duration": e.get("duration"),
                    "views": e.get("view_count"),
                    "thumbnail": f"https://i.ytimg.com/vi/{e.get('id')}/hqdefault.jpg",
                    "published": _timestamp_to_upload_date(e.get("timestamp")),
                })
            if results:
                _trending_cache = results
                _trending_cache_at = _time.time()
            return _page(results)
    except Exception as ex:
        if _trending_cache:
            return _page(_trending_cache)
        raise HTTPException(500, str(ex))


@app.get("/api/video/{video_id}")
async def video_info(video_id: str):
    """Get video metadata."""
    try:
        opts = {**ydl_opts_base(), "extract_flat": False}
        with crea_ydl(opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
            return {
                "id": info.get("id"),
                "title": info.get("title"),
                "description": info.get("description", "")[:500],
                "channel": info.get("uploader"),
                "channel_id": info.get("channel_id"),
                "duration": info.get("duration"),
                "views": info.get("view_count"),
                "likes": info.get("like_count"),
                "thumbnail": f"https://i.ytimg.com/vi/{video_id}/maxresdefault.jpg",
                "published": info.get("upload_date"),
                "tags": info.get("tags", [])[:10],
            }
    except Exception as ex:
        raise HTTPException(500, str(ex))


# ─── Commenti ────────────────────────────────────────────────────────────────
#
# Due sorgenti, scelte in questo ordine:
#
#   1. YouTube Data API (solo con account Google collegato) — ha una
#      paginazione vera: "carica altri commenti" costa una richiesta piccola,
#      quindi si arriva davvero in fondo al thread, e si possono aprire le
#      risposte di un commento singolo. È anche l'unica via per pubblicare.
#   2. yt-dlp — nessuna continuazione riutilizzabile fra una richiesta e
#      l'altra: ogni estrazione riparte da zero e scarica i primi N commenti.
#      Per non ri-scaricare tutto ad ogni "carica altri" i risultati finiscono
#      in cache e si passa allo scaglione successivo solo quando la pagina
#      richiesta esce dal materiale già in mano (vedi _YTDLP_TIERS).

_YTDLP_TIERS = [100, 300, 800, 2000]   # quanti commenti chiedere a yt-dlp, per tentativi successivi
_YTDLP_CACHE_TTL = 900                 # 15 min: oltre, il thread può essere cambiato
_YTDLP_CACHE_MAX_VIDEOS = 8            # tetto alla memoria: si ricorda solo l'ultima manciata di video
_ytdlp_comments_cache: dict = {}       # (video_id, sort) -> {comments, tier, count, at, exhausted}
_ytdlp_comments_lock = asyncio.Lock()  # una sola estrazione alla volta: sono lente e pesanti


def _extract_comments_ytdlp(video_id: str, sort: str, max_comments: int) -> dict:
    """Estrazione bloccante dei commenti principali via yt-dlp (va chiamata in un executor)."""
    base = ydl_opts_base()
    opts = {
        **base,
        "extract_flat": False,
        "getcomments": True,
        "extractor_args": {**base.get("extractor_args", {}), "youtube": {
            # [max_comments, max_parents, max_replies, max_replies_per_thread]
            # Le risposte restano a 0: moltiplicherebbero le richieste a YouTube
            # e qui non c'è modo di caricarle solo per il thread che si apre.
            "max_comments": [str(max_comments), str(max_comments), "0", "0"],
            "comment_sort": ["top" if sort != "new" else "new"],
        }},
    }
    with crea_ydl(opts) as ydl:
        info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
    comments = []
    for c in (info.get("comments") or []):
        if c.get("parent") and c.get("parent") != "root":
            continue  # solo commenti principali, niente risposte
        comments.append({
            "id": c.get("id"),
            "text": c.get("text"),
            "author": c.get("author"),
            "author_thumbnail": c.get("author_thumbnail"),
            "author_channel_id": c.get("author_id"),
            "author_is_uploader": bool(c.get("author_is_uploader")),
            "likes": c.get("like_count") or 0,
            "published": c.get("timestamp"),
            "reply_count": 0,
        })
    return {"comments": comments, "count": info.get("comment_count")}


async def _comments_ytdlp_page(video_id: str, sort: str, offset: int, limit: int) -> dict:
    """Una pagina di commenti da yt-dlp, allargando la cache solo quando serve."""
    key = (video_id, sort)
    async with _ytdlp_comments_lock:
        entry = _ytdlp_comments_cache.get(key)
        if entry and time.time() - entry["at"] > _YTDLP_CACHE_TTL:
            entry = None
        # Serve altro materiale? Si sale di scaglione finché la pagina
        # richiesta non è coperta (o finché YouTube non ne dà più).
        while entry is None or (
            not entry["exhausted"]
            and offset + limit > len(entry["comments"])
            and entry["tier"] < _YTDLP_TIERS[-1]
        ):
            tier = _YTDLP_TIERS[0] if entry is None else next(
                (t for t in _YTDLP_TIERS if t > entry["tier"]), _YTDLP_TIERS[-1]
            )
            got = await asyncio.get_event_loop().run_in_executor(
                None, _extract_comments_ytdlp, video_id, sort, tier
            )
            entry = {
                "comments": got["comments"],
                "count": got["count"],
                "tier": tier,
                "at": time.time(),
                # Meno commenti del tetto richiesto = il thread è finito.
                "exhausted": len(got["comments"]) < tier,
            }
            _ytdlp_comments_cache[key] = entry
            # Ogni voce può arrivare a 2000 commenti: si tengono solo gli
            # ultimi video guardati, il resto si può sempre riestrarre.
            while len(_ytdlp_comments_cache) > _YTDLP_CACHE_MAX_VIDEOS:
                _ytdlp_comments_cache.pop(next(iter(_ytdlp_comments_cache)))

    page = entry["comments"][offset:offset + limit]
    more = offset + len(page) < len(entry["comments"]) or not entry["exhausted"]
    return {
        "comments": page,
        # yt-dlp riporta come comment_count quanti commenti ha estratto, non
        # quanti ne ha il video: finché il thread non è finito quel numero
        # sarebbe solo il tetto che gli abbiamo imposto (es. "100" su un video
        # con due milioni di commenti), quindi è meglio non mostrarlo affatto.
        "comment_count": entry["count"] if entry["exhausted"] else None,
        "next_page_token": str(offset + len(page)) if (more and page) else "",
        "source": "ytdlp",
    }


@app.get("/api/comments/{video_id}")
async def get_comments(
    video_id: str,
    limit: int = 40,
    sort: str = "top",              # top (più pertinenti) | new (più recenti)
    page_token: str = "",           # vuoto = prima pagina
    channel_id: str = "",           # canale del video: serve per l'etichetta AUTORE
):
    """
    Una pagina di commenti principali. Chiamata separata da /api/watch così i
    commenti non rallentano l'avvio del video: la pagina li carica in
    background dopo che il player è già partito, e le pagine successive
    arrivano quando l'utente preme "carica altri commenti".
    """
    sort = "new" if sort == "new" else "top"
    limit = max(1, min(limit, 100))
    can_comment = auth_manager.can_comment()

    if auth_manager.is_authenticated():
        try:
            data = await auth_manager.list_comment_threads(video_id, sort, page_token, limit)
            for c in data["comments"]:
                if channel_id and c.get("author_channel_id") == channel_id:
                    c["author_is_uploader"] = True
            return {
                "comments": data["comments"],
                "comment_count": data["total"],
                "next_page_token": data["next_page_token"],
                "source": "api",
                "can_comment": can_comment,
                "supports_replies": True,
            }
        except YouTubeAPIError as ex:
            if ex.reason in ("commentsDisabled", "videoNotFound"):
                return {"comments": [], "comment_count": None, "next_page_token": "",
                        "source": "api", "can_comment": False, "supports_replies": True,
                        "error": "I commenti sono disattivati per questo video."}
            # Quota finita, API non abilitata, token con scope vecchio: si
            # ripiega su yt-dlp invece di lasciare la sezione vuota.
            print(f"[comments] Data API non utilizzabile ({ex.reason}): {ex.message}")
        except Exception as ex:
            print(f"[comments] Data API errore: {ex}")

    try:
        out = await _comments_ytdlp_page(video_id, sort, int(page_token or 0), limit)
        out["can_comment"] = can_comment
        out["supports_replies"] = False
        return out
    except Exception as ex:
        # Non deve mai bloccare la pagina video: se i commenti falliscono
        # (video con commenti disattivati, errore di estrazione) si mostra
        # semplicemente una sezione vuota invece di un errore.
        return {"comments": [], "comment_count": None, "next_page_token": "",
                "source": "ytdlp", "can_comment": can_comment,
                "supports_replies": False, "error": str(ex)}


@app.get("/api/comments/{video_id}/replies")
async def get_comment_replies(video_id: str, parent_id: str, page_token: str = "", limit: int = 50):
    """Risposte a un singolo commento — solo con account collegato (yt-dlp non le sa dare a richiesta)."""
    if not auth_manager.is_authenticated():
        raise HTTPException(403, "Le risposte richiedono un account Google collegato")
    try:
        data = await auth_manager.list_comment_replies(parent_id, page_token, limit)
        return {"comments": data["comments"], "next_page_token": data["next_page_token"]}
    except YouTubeAPIError as ex:
        raise HTTPException(400, ex.message)
    except Exception as ex:
        raise HTTPException(500, str(ex))


class NewComment(BaseModel):
    text: str
    parent_id: Optional[str] = None   # valorizzato = risposta a un commento


@app.post("/api/comments/{video_id}")
async def create_comment(video_id: str, body: NewComment):
    """
    Pubblica un commento (o una risposta) a nome dell'account collegato.
    Richiede lo scope di scrittura: chi si era collegato prima deve rifare il
    login dalle impostazioni, altrimenti Google rifiuta con 403.
    """
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(400, "Il commento è vuoto")
    if not auth_manager.is_authenticated():
        raise HTTPException(403, "Collega un account Google per commentare")
    if not auth_manager.can_comment():
        raise HTTPException(403, "L'account collegato non ha il permesso di commentare: "
                                 "ricollegalo dalle impostazioni per concederlo")
    try:
        if body.parent_id:
            comment = await auth_manager.post_reply(body.parent_id, text)
        else:
            comment = await auth_manager.post_comment(video_id, text)
        return {"comment": comment}
    except YouTubeAPIError as ex:
        if ex.reason in ("insufficientPermissions", "forbidden"):
            raise HTTPException(403, "Permesso negato da YouTube: ricollega l'account dalle impostazioni")
        if ex.reason == "commentsDisabled":
            raise HTTPException(400, "I commenti sono disattivati per questo video")
        if ex.reason in ("quotaExceeded", "rateLimitExceeded"):
            raise HTTPException(429, "Quota giornaliera della YouTube Data API esaurita")
        raise HTTPException(400, ex.message)
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


@app.get("/api/subtitles/{video_id}")
async def list_subtitles(video_id: str):
    """Lingue sottotitoli disponibili per il video (quasi sempre solo automatici — i sottotitoli caricati a mano sono rari)."""
    try:
        opts = {**ydl_opts_base(), "extract_flat": False}
        with crea_ydl(opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
        merged = _subtitle_tracks(info)
        # YouTube traduce automaticamente in ~150 lingue: senza filtro il menu
        # sarebbe illeggibile. Teniamo solo le lingue comuni + quelle caricate
        # a mano dall'autore (sempre rilevanti, anche se rare).
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


@app.get("/api/subtitles/{video_id}/{lang}.vtt")
async def get_subtitle_vtt(video_id: str, lang: str):
    """Proxy del sottotitolo WebVTT — scaricato qui invece che puntare il <track> direttamente a YouTube per evitare problemi di CORS."""
    try:
        opts = {**ydl_opts_base(), "extract_flat": False}
        with crea_ydl(opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
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


@app.get("/api/stream/{video_id}")
async def stream_video(video_id: str, quality: str = "best"):
    """
    Stream video directly (no full download needed).
    Returns a redirect to the direct video URL from YouTube CDN.
    """
    try:
        opts = {
            **ydl_opts_base(),
            "extract_flat": False,
            "format": _progressive_format_selector(quality),
        }
        with crea_ydl(opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
            url = info.get("url")
            if not url:
                raise HTTPException(404, "No stream URL found")
            return JSONResponse({"stream_url": url, "title": info.get("title"), "ext": info.get("ext", "mp4")})
    except HTTPException:
        raise
    except Exception as ex:
        raise HTTPException(500, str(ex))


@app.get("/api/watch/{video_id}")
async def watch(video_id: str, quality: str = "best"):
    """
    Metadata + stream URL in un'unica estrazione yt-dlp, invece delle due
    richieste separate di /api/video + /api/stream: dimezza il tempo prima
    che il video parta dopo il click sulla copertina.
    """
    try:
        opts = {
            **ydl_opts_base(),
            "extract_flat": False,
            "format": _progressive_format_selector(quality),
        }
        with crea_ydl(opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
            url = info.get("url")
            if not url:
                raise HTTPException(404, "No stream URL found")
            return {
                "id": info.get("id"),
                "title": info.get("title"),
                "description": info.get("description", "")[:500],
                "channel": info.get("uploader"),
                "channel_id": info.get("channel_id"),
                "duration": info.get("duration"),
                "views": info.get("view_count"),
                "likes": info.get("like_count"),
                "thumbnail": f"https://i.ytimg.com/vi/{video_id}/maxresdefault.jpg",
                "published": info.get("upload_date"),
                "tags": info.get("tags", [])[:10],
                "stream_url": url,
                "ext": info.get("ext", "mp4"),
            }
    except HTTPException:
        raise
    except Exception as ex:
        raise HTTPException(500, str(ex))


_FFMPEG_BIN = _shutil.which("ffmpeg") or "ffmpeg"

# Cache degli URL di formato usati da /api/mux. Serve al seek: saltare in un
# altro punto del video significa riavviare ffmpeg, e senza cache ogni salto
# ripagherebbe l'estrazione yt-dlp (1-3 secondi) prima ancora di iniziare a
# scaricare. Gli URL googlevideo restano validi diverse ore, ma 30 minuti
# tengono il margine largo.
_mux_fmt_cache: dict = {}
_MUX_FMT_CACHE_TTL = 1800


def _mux_formats(video_id: str, quality: str, compat: bool):
    """URL video+audio (o singolo URL progressivo) per /api/mux, con cache."""
    key = (video_id, quality, compat)
    hit = _mux_fmt_cache.get(key)
    if hit and _time.time() - hit[0] < _MUX_FMT_CACHE_TTL:
        return hit[1]

    # compat=1 (usato dal Chromecast): forza H.264+AAC invece del meglio
    # assoluto, che sarebbe AV1+Opus e la TV non lo riprodurrebbe.
    selector = _cast_format_selector(quality) if compat else _adaptive_format_selector(quality)
    opts = {**ydl_opts_base(), "extract_flat": False, "format": selector}
    with crea_ydl(opts) as ydl:
        info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)

    requested = info.get("requested_formats")
    if requested and len(requested) >= 2:
        video_fmt = next((f for f in requested if f.get("vcodec") != "none"), requested[0])
        audio_fmt = next((f for f in requested if f.get("acodec") != "none" and f.get("vcodec") == "none"), requested[-1])
        urls = (video_fmt["url"], audio_fmt["url"])
    else:
        url = info.get("url")
        if not url:
            return None
        urls = (url, None)

    _mux_fmt_cache[key] = (_time.time(), urls)
    # Potatura opportunistica: senza, la cache cresce per tutta la vita del
    # processo su un server che resta acceso per giorni.
    if len(_mux_fmt_cache) > 64:
        now = _time.time()
        for k in [k for k, v in _mux_fmt_cache.items() if now - v[0] >= _MUX_FMT_CACHE_TTL]:
            _mux_fmt_cache.pop(k, None)
    return urls


@app.get("/api/mux/{video_id}")
async def mux_stream(video_id: str, quality: str = "best", compat: bool = False, start: float = 0):
    """
    Streaming ad alta qualità: unisce al volo con ffmpeg i flussi video e
    audio separati che YouTube offre oltre i 360p (vedi _adaptive_format_selector),
    invece del singolo formato "combinato" a bassa qualità usato da /api/watch.
    Solo remux (-c copy, nessuna transcodifica) — leggero anche su hardware
    modesto come un Raspberry Pi.

    Il flusso è generato in tempo reale, quindi non ha né Content-Length né
    supporto Range: il browser da solo non può saltare avanti nella barra oltre
    quello che ha già bufferizzato. Da qui il parametro `start`: invece di
    chiedere al browser di cercare dentro un flusso che non è cercabile, il
    player ricomincia il flusso dal secondo richiesto (ffmpeg `-ss` prima degli
    input, che usa il Range degli URL googlevideo e quindi non riscarica il
    video da capo) e mostra `start + currentTime` come posizione. Il risultato
    per l'utente è una barra normale, con durata intera e seek in entrambe le
    direzioni.

    `-copypriorss 0` è quello che rende il salto preciso. In sola copia ffmpeg
    per default tiene il keyframe che precede il punto richiesto e poi salta al
    punto vero: il risultato è un flusso che comincia con un fotogramma fermo
    per tutta la distanza fra i due (misurati fino a 7 secondi di immagine
    congelata) e un audio che parte ~10s prima del punto chiesto. Scartando quel
    keyframe il flusso comincia dove è stato chiesto: misurato, audio esatto al
    centesimo e video entro mezzo secondo. Video e audio ricevono lo stesso
    `-ss`, quindi il sincronismo fra i due resta invariato.

    Su rete locale il bitrate più alto è "gratis"; da remoto (es. Tailscale) il
    traffico passa dal PC, quindi pesa sulla sua banda in upload.

    Frammentazione a tempo fisso (frag_duration), non per keyframe: i video
    YouTube hanno spesso il secondo keyframe a 5-6s dall'inizio, e con
    frag_keyframe il primo blocco utilizzabile non può chiudersi prima di
    allora — il player restava fermo 10+ secondi prima del primo fotogramma.
    Con frag_duration=1s il primo blocco è pronto in ~1-2s indipendentemente
    dai keyframe del sorgente (misurato: da 10-15s a 1-2s di avvio).
    """
    try:
        urls = await asyncio.get_running_loop().run_in_executor(
            None, _mux_formats, video_id, quality, compat
        )
    except Exception as ex:
        raise HTTPException(500, str(ex))
    if not urls:
        raise HTTPException(404, "Nessun formato disponibile")

    video_url, audio_url = urls
    start = max(0.0, start)
    # -ss PRIMA di -i: seek sull'input (una richiesta Range al CDN) invece che
    # scorrimento del flusso decodificato, che a video lunghi costerebbe minuti.
    seek = ["-ss", f"{start:.3f}"] if start > 0 else []
    # Opzione di output (dopo gli input): scarta il keyframe precedente al
    # punto di seek. Solo quando si cerca davvero — a start=0 non c'è nulla da
    # scartare e non vale la pena toccare il percorso di avvio.
    prior = ["-copypriorss", "0"] if start > 0 else []
    movflags = "empty_moov+default_base_moof"

    if audio_url:
        cmd = [
            _FFMPEG_BIN, "-loglevel", "error",
            *seek, "-i", video_url,
            *seek, "-i", audio_url,
            "-map", "0:v:0", "-map", "1:a:0", "-c", "copy", *prior,
            "-movflags", movflags, "-frag_duration", "1000000",
            "-f", "mp4", "pipe:1",
        ]
    else:
        cmd = [
            _FFMPEG_BIN, "-loglevel", "error",
            *seek, "-i", video_url, "-c", "copy", *prior,
            "-movflags", movflags, "-frag_duration", "1000000",
            "-f", "mp4", "pipe:1",
        ]

    proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)

    # stderr letto in parallelo, non scartato: se ffmpeg muore subito il client
    # vede solo un flusso vuoto, e senza questo messaggio nei log non c'è modo
    # di sapere perché. Va consumato mentre gira, altrimenti a buffer pieno
    # ffmpeg si blocca.
    errbuf: list = []

    async def drain_err():
        while True:
            line = await proc.stderr.readline()
            if not line:
                break
            errbuf.append(line.decode(errors="replace").rstrip())
            del errbuf[:-20]

    err_task = asyncio.create_task(drain_err())

    async def stream_gen():
        sent = 0
        try:
            while True:
                chunk = await proc.stdout.read(65536)
                if not chunk:
                    break
                sent += len(chunk)
                yield chunk
            if sent == 0:
                await asyncio.wait_for(err_task, timeout=2)
                print(f"[mux] ffmpeg non ha prodotto nulla per {video_id} "
                      f"(quality={quality}, start={start}): " + " | ".join(errbuf[-5:]))
        finally:
            # Il client può disconnettersi a metà (cambio pagina, seek che
            # ricarica il player): senza questo ffmpeg resterebbe orfano a
            # scaricare da YouTube all'infinito.
            if proc.returncode is None:
                proc.kill()
                await proc.wait()
            err_task.cancel()

    # Accept-Ranges: none dichiarato esplicitamente — senza, il browser manda
    # "Range: bytes=0-" (come fa sempre per i video) e riceve un 200 invece
    # del 206 che si aspetta: Chromium resta in attesa cauta invece di committarsi
    # subito allo streaming progressivo, ritardando l'avvio di diversi secondi.
    return StreamingResponse(stream_gen(), media_type="video/mp4", headers={"Accept-Ranges": "none"})


@app.get("/api/download/{video_id}")
async def download_video(video_id: str, quality: str = "best"):
    """
    Download video to temp cache and serve it.
    Used for desktop (then opened in VLC) or mobile download.
    """
    cache_path = DOWNLOAD_DIR / f"{video_id}_{quality}.mp4"

    if not cache_path.exists():
        format_selector = "bestvideo[height<=1080]+bestaudio/best[height<=720]/best"
        if quality == "720":
            format_selector = "bestvideo[height<=720]+bestaudio/best[height<=720]/best"
        elif quality == "480":
            format_selector = "best[height<=480]/best"

        opts = {
            "quiet": True,
            "no_warnings": True,
            "format": format_selector,
            "outtmpl": str(cache_path).replace(".mp4", ".%(ext)s"),
            "merge_output_format": "mp4",
            "postprocessors": [{"key": "FFmpegVideoConvertor", "preferedformat": "mp4"}],
        }
        with crea_ydl(opts) as ydl:
            ydl.download([f"https://www.youtube.com/watch?v={video_id}"])

        # find actual file
        for f in DOWNLOAD_DIR.glob(f"{video_id}_{quality}.*"):
            if f.suffix != ".part":
                cache_path = f
                break

    if not cache_path.exists():
        raise HTTPException(404, "Download failed")

    return FileResponse(
        cache_path,
        media_type="video/mp4",
        headers={"Content-Disposition": f'attachment; filename="{video_id}.mp4"'},
    )


@app.get("/api/suggestions")
async def suggestions(q: str = Query(...)):
    """Autocomplete suggestions."""
    try:
        encoded = urllib.parse.quote(q)
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q={encoded}",
                timeout=5,
            )
            text = r.text
            # parse JSONP: window.google.ac.h(["q",[...]])
            match = re.search(r'\["[^"]*",(\[.*?\])\]', text)
            if match:
                items = json.loads(match.group(1))
                return {"suggestions": [i[0] if isinstance(i, list) else i for i in items[:8]]}
    except Exception:
        pass
    return {"suggestions": []}


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/lan-address")
async def lan_address():
    """
    Indirizzo del server come lo vede il resto della rete locale.

    Serve al Chromecast: la TV scarica il video da sé, quindi un URL su
    localhost punterebbe alla TV stessa e il cast fallirebbe. Finché non
    c'era questo endpoint il bottone Cast si limitava a rifiutare quando la
    pagina era aperta su localhost — cioè quasi sempre, visto che il server
    gira sullo stesso PC da cui si guarda.

    Il socket UDP non manda nessun pacchetto: serve solo a farsi dire dal
    sistema operativo quale interfaccia userebbe per uscire verso la rete,
    che è quella giusta anche con più schede (Wi-Fi + Ethernet + Docker).
    """
    import socket

    ip = ""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except OSError:
        ip = ""
    finally:
        s.close()

    if not ip or ip.startswith("127."):
        return {"address": "", "port": SERVER_PORT}
    return {"address": f"http://{ip}:{SERVER_PORT}", "ip": ip, "port": SERVER_PORT}


# ─── Startup: avvia sync scheduler ───────────────────────────────────────────

@app.on_event("startup")
async def on_startup():
    # Il loop di sync gira subito un ciclo se già autenticato (vedi sync.py),
    # quindi non serve un altro force_sync qui: raddoppierebbe le richieste
    # (116 canali scansionati due volte ad ogni riavvio del server).
    scheduler.start(auth_manager, ydl_opts_base)


# ─── Auth status ──────────────────────────────────────────────────────────────

@app.get("/api/auth/status")
async def auth_status():
    cookie_status = auth_manager.get_cookie_status()
    return {
        "authenticated": auth_manager.is_authenticated(),
        # False su un account collegato prima che esistesse la pubblicazione
        # dei commenti: il suo token non ha lo scope di scrittura.
        "can_comment": auth_manager.can_comment(),
        "subscription_count": len(auth_manager.get_subscriptions()),
        "cookie": cookie_status,
        "sync": scheduler.get_status(),
        "prefs": auth_manager.get_prefs(),
    }


# ─── OAuth flow ───────────────────────────────────────────────────────────────

class OAuthSetup(BaseModel):
    client_id: str
    client_secret: str


class OAuthCallback(BaseModel):
    code: str
    client_id: str
    client_secret: str
    redirect_uri: str


@app.post("/api/auth/url")
async def get_auth_url(body: OAuthSetup):
    """Genera URL per il login Google."""
    redirect_uri = OAUTH_REDIRECT_URI
    url = auth_manager.get_auth_url(body.client_id, redirect_uri)
    # Salva temporaneamente client_id/secret per il callback
    (Path(__file__).parent.parent / "data").mkdir(exist_ok=True)
    tmp = Path(__file__).parent.parent / "data" / "oauth_setup.json"
    tmp.write_text(json.dumps({"client_id": body.client_id, "client_secret": body.client_secret}))
    return {"auth_url": url}


class DeviceStart(BaseModel):
    client_id: str
    client_secret: str


class DevicePoll(BaseModel):
    device_code: str


@app.post("/api/auth/device/start")
async def auth_device_start(body: DeviceStart):
    """Device flow: chiede il codice da digitare su google.com/device.

    È il metodo consigliato perché non usa nessun redirect: vale anche quando
    il server gira su un altro computer della rete (Raspberry, NAS), dove il
    redirect a localhost del flow web finirebbe sul browser invece che qui.
    """
    data = await auth_manager.start_device_flow(body.client_id)
    (Path(__file__).parent.parent / "data").mkdir(exist_ok=True)
    tmp = Path(__file__).parent.parent / "data" / "oauth_setup.json"
    tmp.write_text(json.dumps({"client_id": body.client_id, "client_secret": body.client_secret}))
    return {
        "device_code": data["device_code"],
        "user_code": data["user_code"],
        "verification_url": data.get("verification_url") or data.get("verification_uri"),
        "interval": data.get("interval", 5),
        "expires_in": data.get("expires_in", 1800),
    }


@app.post("/api/auth/device/poll")
async def auth_device_poll(body: DevicePoll):
    """Device flow: l'utente ha autorizzato? Risponde pending finché non lo fa."""
    tmp = Path(__file__).parent.parent / "data" / "oauth_setup.json"
    setup = json.loads(tmp.read_text())
    res = await auth_manager.poll_device_token(body.device_code, setup["client_id"], setup["client_secret"])
    if res["status"] == "ok":
        asyncio.create_task(scheduler.force_sync(auth_manager, ydl_opts_base))
    return res


@app.get("/api/auth/callback-page")
async def oauth_callback_page(code: str = None, error: str = None):
    """Pagina di callback OAuth — riceve il code e completa il flow."""
    if error:
        html = f"<html><body style='background:#0f0f0f;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh'><div>Errore: {error}</div></body></html>"
        return StreamingResponse(iter([html]), media_type="text/html")

    if not code:
        html = "<html><body style='background:#0f0f0f;color:#fff'>Nessun codice ricevuto.</body></html>"
        return StreamingResponse(iter([html]), media_type="text/html")

    try:
        tmp = Path(__file__).parent.parent / "data" / "oauth_setup.json"
        setup = json.loads(tmp.read_text())
        redirect_uri = OAUTH_REDIRECT_URI
        await auth_manager.exchange_code(code, setup["client_id"], setup["client_secret"], redirect_uri)
        # Sync immediato
        asyncio.create_task(scheduler.force_sync(auth_manager, ydl_opts_base))
        html = """<html><head><meta charset='utf-8'></head>
<body style='background:#0f0f0f;color:#fff;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:16px'>
  <div style='font-size:48px'>✅</div>
  <div style='font-size:20px;font-weight:700'>Account collegato!</div>
  <div style='color:#aaa'>Le tue iscrizioni si stanno sincronizzando...</div>
  <script>setTimeout(() => window.close(), 2000)</script>
</body></html>"""
    except Exception as e:
        html = f"<html><body style='background:#0f0f0f;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh'>Errore: {e}</body></html>"

    return StreamingResponse(iter([html]), media_type="text/html")


@app.post("/api/auth/logout")
async def logout():
    auth_manager.logout()
    return {"ok": True}


@app.get("/api/auth/me")
async def auth_me():
    """
    Canale YouTube dell'account collegato: nome e avatar mostrati nella
    casella "commenta come". Endpoint a parte e non in /api/auth/status
    perché costa una chiamata di rete e serve solo alla pagina video.
    """
    me = await auth_manager.get_my_channel()
    return {"channel": me, "can_comment": auth_manager.can_comment()}


# ─── Subscriptions ────────────────────────────────────────────────────────────

@app.get("/api/subscriptions")
async def get_subscriptions():
    # can_manage: se il token collegato può anche scrivere (vedi can_manage_subs).
    # Serve alla lista canali per sapere se offrire la disiscrizione.
    return {"subscriptions": auth_manager.get_subscriptions(), "can_manage": auth_manager.can_manage_subs()}


@app.post("/api/subscriptions/sync")
async def force_sync_subs():
    await scheduler.force_sync(auth_manager, ydl_opts_base)
    return {"subscriptions": auth_manager.get_subscriptions(), "sync": scheduler.get_status()}


def _check_subs_write():
    """Requisiti comuni a iscrizione e disiscrizione (vedi can_manage_subs)."""
    if not auth_manager.is_authenticated():
        raise HTTPException(403, "Collega un account Google per gestire le iscrizioni")
    if not auth_manager.can_manage_subs():
        raise HTTPException(403, "L'account collegato è di sola lettura: "
                                 "ricollegalo dalle impostazioni per gestire le iscrizioni")


def _subs_write_error(ex: YouTubeAPIError) -> HTTPException:
    if ex.reason in ("insufficientPermissions", "forbidden"):
        return HTTPException(403, "Permesso negato da YouTube: ricollega l'account dalle impostazioni")
    if ex.reason in ("quotaExceeded", "rateLimitExceeded"):
        return HTTPException(429, "Quota giornaliera della YouTube Data API esaurita")
    if ex.reason == "subscriptionDuplicate":
        return HTTPException(400, "Sei già iscritto a questo canale")
    return HTTPException(400, ex.message)


@app.post("/api/subscriptions/{channel_id}")
async def subscribe_channel(channel_id: str):
    """Iscrive l'account collegato al canale. Costo quota: 50 unità."""
    _check_subs_write()
    try:
        return await auth_manager.subscribe(channel_id)
    except YouTubeAPIError as ex:
        raise _subs_write_error(ex)
    except Exception as ex:
        raise HTTPException(500, str(ex))


@app.delete("/api/subscriptions/{channel_id}")
async def unsubscribe_channel(channel_id: str):
    """Disiscrive l'account collegato dal canale. Costo quota: 51 unità (ricerca + cancellazione)."""
    _check_subs_write()
    try:
        return await auth_manager.unsubscribe(channel_id)
    except YouTubeAPIError as ex:
        raise _subs_write_error(ex)
    except Exception as ex:
        raise HTTPException(500, str(ex))


@app.get("/api/feed/subscriptions")
async def subscription_feed(limit: int = 30, offset: int = 0):
    """
    Feed 'Iscrizioni': ultimi video di TUTTI i canali a cui sei iscritto, in
    ordine di pubblicazione. Cookie → feed reale di YouTube; altrimenti la
    cache aggiornata in background (vedi sync.py) dagli ultimi video di ogni
    canale iscritto. Paginato (limit/offset) — il frontend richiede pagine
    successive con "Carica altri" invece di ricevere tutto in un colpo solo.
    """
    results = await auth_manager.get_personalized_feed(ydl_opts_base)
    return {
        "results": results[offset:offset + limit],
        "total": len(results),
        "has_more": offset + limit < len(results),
        "source": "cookies" if auth_manager.get_cookie_path() else "local",
    }


@app.get("/api/feed/home")
async def home_feed(limit: int = 24, offset: int = 0):
    """
    Feed 'Home': la vera homepage di YouTube (raccomandazioni, non solo
    iscrizioni) se hai caricato i cookie in Impostazioni. Senza cookie non
    c'è modo di replicare l'algoritmo di raccomandazione di YouTube, quindi
    il frontend fa fallback su /api/trending.

    Paginato (limit/offset) per lo scroll infinito della home. L'estrazione è
    pigra: ogni pagina scarica da YouTube solo i blocchi che servono, quindi
    scorrere poco costa poco.

    Quando è vuoto restituisce anche `reason` (no-cookies / not-logged-in /
    feed-vuoto): la home lo mostra all'utente invece di rimpiazzare in
    silenzio le raccomandazioni con i trending.
    """
    page = await auth_manager.get_home_feed_page(offset, limit, ydl_opts_base)
    return {**page, "source": "cookies" if page["total"] else "none"}


@app.get("/api/related/{video_id}")
async def related(video_id: str, limit: int = 20, offset: int = 0):
    """
    Video correlati a un video, dal "Mix" di YouTube (playlist RD<id>).

    È la lista che YouTube stessa costruisce a partire da un video e si
    estende con continuazioni quasi senza fine: regge lo scroll infinito
    della sidebar. Prima i correlati erano una ricerca sulle prime 4 parole
    del titolo, tagliata a 15 risultati — spesso fuori tema e non paginabile.

    Estrazione pigra come la home: ogni pagina costa solo i blocchi che servono.
    """
    return await auth_manager.get_related_page(video_id, offset, limit, ydl_opts_base)



@app.get("/api/channel-avatars")
async def channel_avatars(ids: str = Query(...)):
    """
    Loghi canale in batch: {channel_id: avatar_url}. yt-dlp in modalità
    'flat' (usata per liste/ricerca) non include il logo del canale, solo
    quello del video — va richiesto separatamente. Usa la YouTube Data API
    (fino a 50 canali per richiesta) con cache su disco.
    """
    channel_ids = [c for c in ids.split(",") if c]
    avatars = await auth_manager.get_channel_avatars(channel_ids)
    return {"avatars": avatars}


@app.get("/api/channel/{channel_id}/videos")
async def channel_videos(channel_id: str, limit: int = 30, offset: int = 0):
    """
    Video di un canale, a pagine, più l'intestazione del canale in `channel`
    (nome, logo, copertina, iscritti) — che arriva con la stessa estrazione,
    quindi non costa una richiesta in più.

    Estrazione pigra come la home: scorrere poco costa poche richieste.
    """
    return await auth_manager.get_channel_page(channel_id, offset, limit, ydl_opts_base)


# ─── Cookies ──────────────────────────────────────────────────────────────────

@app.post("/api/cookies/upload")
async def upload_cookies(file: UploadFile = File(...)):
    """Carica il file cookies.txt esportato dal browser."""
    content = (await file.read()).decode("utf-8", errors="ignore")
    result = auth_manager.save_cookies(content)
    if not result["valid"]:
        raise HTTPException(400, "File cookie non valido. Esporta da Chrome/Firefox con l'estensione 'Get cookies.txt'")
    if not result["logged_in"]:
        # Il file c'è ma non contiene una sessione youtube.com: meglio dirlo
        # ora che lasciar scoprire più tardi una home senza raccomandazioni.
        return {**result, "message": (
            f"Cookie salvati ({result['cookie_count']}), ma non contengono una sessione YouTube: "
            "fai login su youtube.com nel browser da cui esporti, poi riesporta."
        )}
    return {**result, "message": f"Cookie salvati ({result['cookie_count']} cookie)"}


@app.delete("/api/cookies")
async def delete_cookies():
    auth_manager.delete_cookies()
    return {"ok": True}


@app.get("/api/cookies/browsers")
async def cookies_browsers():
    """
    Browser installati SULLA MACCHINA CHE ESEGUE IL SERVER con una sessione
    YouTube attiva — per proporre l'importazione automatica dei cookie senza
    passare da estensioni/export manuale.
    """
    browsers = auth_manager.detect_browsers_with_youtube_login()
    return {"browsers": browsers}


@app.post("/api/cookies/import")
async def import_cookies(browser: str = Query(...)):
    """Importa i cookie YouTube/Google direttamente dal database del browser indicato."""
    try:
        result = auth_manager.import_cookies_from_browser(browser)
    except Exception as ex:
        raise HTTPException(500, str(ex))
    if not result["valid"]:
        raise HTTPException(400, (
            f"In {browser.capitalize()} non c'è una sessione YouTube. Essere loggati su Google "
            "non basta: apri youtube.com in quel browser, verifica di essere loggato, poi riprova."
        ))
    return {**result, "message": f"Cookie importati da {browser.capitalize()} ({result['cookie_count']} cookie)"}


# ─── History ──────────────────────────────────────────────────────────────────

class HistoryEntry(BaseModel):
    id: str
    title: str
    channel: Optional[str] = None
    thumbnail: Optional[str] = None


@app.post("/api/history")
async def add_history(entry: HistoryEntry):
    auth_manager.add_to_history(entry.dict())
    return {"ok": True}


@app.get("/api/history")
async def get_history():
    return {"history": auth_manager.get_history()}


@app.delete("/api/history")
async def clear_history():
    auth_manager.clear_history()
    return {"ok": True}


# ─── Preferences ─────────────────────────────────────────────────────────────

class PrefsUpdate(BaseModel):
    quality: Optional[str] = None
    autoplay: Optional[bool] = None
    theme: Optional[str] = None


@app.get("/api/prefs")
async def get_prefs():
    return auth_manager.get_prefs()


@app.patch("/api/prefs")
async def update_prefs(body: PrefsUpdate):
    updates = {k: v for k, v in body.dict().items() if v is not None}
    return auth_manager.update_prefs(updates)



# ─── Serve React frontend ─────────────────────────────────────────────────────
frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"


# index.html non va mai messa in cache, gli asset con l'hash nel nome sempre.
#
# Senza questa distinzione il browser tiene index.html per conto suo (nessun
# header di cache = cache "euristica") e continua a caricare il bundle vecchio
# anche dopo un `npm run build`: la UI resta indietro di una versione e
# ricaricare la pagina non basta, servirebbe svuotare la cache a mano. Gli
# asset invece hanno l'hash del contenuto nel nome (index-BesxxQRe.js), quindi
# un file con quel nome non cambierà mai: si possono tenere per sempre.
NO_CACHE = "no-cache, must-revalidate"
IMMUTABLE_CACHE = "public, max-age=31536000, immutable"


class HashedStaticFiles(StaticFiles):
    def file_response(self, full_path, stat_result, scope, status_code=200):
        resp = super().file_response(full_path, stat_result, scope, status_code)
        name = str(full_path)
        resp.headers["Cache-Control"] = (
            IMMUTABLE_CACHE if "/assets/" in name.replace("\\", "/") else NO_CACHE
        )
        return resp


@app.get("/watch")
@app.get("/search")
@app.get("/subscriptions")
@app.get("/settings")
@app.get("/channel")
async def spa_routes():
    """
    Route "finte": il frontend naviga tra le pagine con la vera History API
    del browser (per far funzionare il tasto Indietro), quindi l'URL cambia
    davvero — es. /watch?v=xxx. Senza queste route, aprire quell'URL
    direttamente o ricaricare la pagina darebbe 404: StaticFiles non sa che
    "watch" in realtà corrisponde alla stessa index.html della home.
    """
    index = frontend_dist / "index.html"
    if not index.exists():
        raise HTTPException(404)
    return FileResponse(index, headers={"Cache-Control": NO_CACHE})


if frontend_dist.exists():
    app.mount("/", HashedStaticFiles(directory=str(frontend_dist), html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=SERVER_PORT, reload=True)



