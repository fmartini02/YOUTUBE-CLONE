import asyncio
import json
import os
import re
import tempfile
import urllib.parse
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import httpx
import yt_dlp

from auth import auth_manager, is_video_entry
from sync import scheduler

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
# ed electron/main.js, ed essere registrata come Authorized redirect URI su Google Cloud Console.
SERVER_PORT = int(os.environ.get("YTPROXY_PORT", 8090))
OAUTH_REDIRECT_URI = f"http://localhost:{SERVER_PORT}/api/auth/callback-page"

# ─── YouTube Data API (no key needed: scraping via yt-dlp) ───────────────────

import shutil as _shutil
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
        with yt_dlp.YoutubeDL(opts) as ydl:
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
        with yt_dlp.YoutubeDL(opts) as ydl:
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
        with yt_dlp.YoutubeDL(opts) as ydl:
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


@app.get("/api/comments/{video_id}")
async def get_comments(video_id: str, limit: int = 30):
    """
    Commenti principali del video (no risposte, per restare veloce: ogni
    livello in più significa altre richieste a YouTube). Chiamata separata da
    /api/watch così i commenti non rallentano l'avvio del video — la pagina li
    carica in background dopo che il player è già partito.
    """
    try:
        opts = {
            **ydl_opts_base(),
            "extract_flat": False,
            "getcomments": True,
            # [max_comments, max_parents, max_replies, max_replies_per_thread]
            "extractor_args": {"youtube": {"max_comments": [str(limit), str(limit), "0", "0"]}},
        }
        with yt_dlp.YoutubeDL(opts) as ydl:
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
                    "author_is_uploader": bool(c.get("author_is_uploader")),
                    "likes": c.get("like_count") or 0,
                    "published": c.get("timestamp"),
                })
            return {"comments": comments[:limit], "comment_count": info.get("comment_count")}
    except Exception as ex:
        # Non deve mai bloccare la pagina video: se i commenti falliscono
        # (video con commenti disattivati, errore di estrazione) si mostra
        # semplicemente una sezione vuota invece di un errore.
        return {"comments": [], "comment_count": None, "error": str(ex)}


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
        with yt_dlp.YoutubeDL(opts) as ydl:
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
        with yt_dlp.YoutubeDL(opts) as ydl:
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
        with yt_dlp.YoutubeDL(opts) as ydl:
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
        with yt_dlp.YoutubeDL(opts) as ydl:
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


@app.get("/api/mux/{video_id}")
async def mux_stream(video_id: str, quality: str = "best", compat: bool = False):
    """
    Streaming ad alta qualità: unisce al volo con ffmpeg i flussi video e
    audio separati che YouTube offre oltre i 360p (vedi _adaptive_format_selector),
    invece del singolo formato "combinato" a bassa qualità usato da /api/watch.
    Solo remux (-c copy, nessuna transcodifica) — leggero anche su hardware
    modesto come un Raspberry Pi.

    Costo noto: essendo un flusso generato in tempo reale (niente
    Content-Length/Range), il browser non può saltare avanti nella barra oltre
    quello che ha già bufferizzato — può solo tornare indietro nel buffer
    ricevuto. Su rete locale il bitrate più alto è "gratis"; da remoto (es.
    Tailscale) il traffico passa dal PC, quindi pesa sulla sua banda in upload.

    Frammentazione a tempo fisso (frag_duration), non per keyframe: i video
    YouTube hanno spesso il secondo keyframe a 5-6s dall'inizio, e con
    frag_keyframe il primo blocco utilizzabile non può chiudersi prima di
    allora — il player restava fermo 10+ secondi prima del primo fotogramma.
    Con frag_duration=1s il primo blocco è pronto in ~1-2s indipendentemente
    dai keyframe del sorgente (misurato: da 10-15s a 1-2s di avvio).
    """
    try:
        # compat=1 (usato dal Chromecast): forza H.264+AAC invece del meglio
        # assoluto, che sarebbe AV1+Opus e la TV non lo riprodurrebbe.
        selector = _cast_format_selector(quality) if compat else _adaptive_format_selector(quality)
        opts = {**ydl_opts_base(), "extract_flat": False, "format": selector}
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
    except Exception as ex:
        raise HTTPException(500, str(ex))

    movflags = "empty_moov+default_base_moof"
    requested = info.get("requested_formats")
    if requested and len(requested) >= 2:
        video_fmt = next((f for f in requested if f.get("vcodec") != "none"), requested[0])
        audio_fmt = next((f for f in requested if f.get("acodec") != "none" and f.get("vcodec") == "none"), requested[-1])
        cmd = [
            _FFMPEG_BIN, "-loglevel", "error",
            "-i", video_fmt["url"], "-i", audio_fmt["url"],
            "-map", "0:v:0", "-map", "1:a:0", "-c", "copy",
            "-movflags", movflags, "-frag_duration", "1000000",
            "-f", "mp4", "pipe:1",
        ]
    else:
        url = info.get("url")
        if not url:
            raise HTTPException(404, "Nessun formato disponibile")
        cmd = [
            _FFMPEG_BIN, "-loglevel", "error",
            "-i", url, "-c", "copy",
            "-movflags", movflags, "-frag_duration", "1000000",
            "-f", "mp4", "pipe:1",
        ]

    proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)

    async def stream_gen():
        try:
            while True:
                chunk = await proc.stdout.read(65536)
                if not chunk:
                    break
                yield chunk
        finally:
            # Il client può disconnettersi a metà (cambio pagina, seek che
            # ricarica il player): senza questo ffmpeg resterebbe orfano a
            # scaricare da YouTube all'infinito.
            if proc.returncode is None:
                proc.kill()
                await proc.wait()

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
        with yt_dlp.YoutubeDL(opts) as ydl:
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


# ─── Subscriptions ────────────────────────────────────────────────────────────

@app.get("/api/subscriptions")
async def get_subscriptions():
    return {"subscriptions": auth_manager.get_subscriptions()}


@app.post("/api/subscriptions/sync")
async def force_sync_subs():
    await scheduler.force_sync(auth_manager, ydl_opts_base)
    return {"subscriptions": auth_manager.get_subscriptions(), "sync": scheduler.get_status()}


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
async def channel_videos(channel_id: str):
    """Ultimi video di un canale."""
    try:
        opts = {**ydl_opts_base(), "playlistend": 20}
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/channel/{channel_id}/videos", download=False)
            entries = (info or {}).get("entries", [])
            results = []
            for e in (entries or []):
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
            return {"results": results}
    except Exception as ex:
        raise HTTPException(500, str(ex))


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


@app.get("/watch")
@app.get("/search")
@app.get("/subscriptions")
@app.get("/settings")
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
    return FileResponse(index)


if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=SERVER_PORT, reload=True)



