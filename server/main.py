import asyncio
import json
import os
import re
import subprocess
import tempfile
import urllib.parse
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import httpx
import yt_dlp

from auth import auth_manager
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
    }


@app.get("/api/search")
async def search(q: str = Query(...), page: int = 1):
    """Search YouTube videos."""
    try:
        opts = {
            **ydl_opts_base(),
            "default_search": "ytsearch20",
            "playlist_items": f"{(page-1)*20+1}-{page*20}",
        }
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"ytsearch20:{q}", download=False)
            entries = info.get("entries", [])
            results = []
            for e in entries:
                if not e:
                    continue
                results.append({
                    "id": e.get("id"),
                    "title": e.get("title"),
                    "channel": e.get("uploader") or e.get("channel"),
                    "duration": e.get("duration"),
                    "views": e.get("view_count"),
                    "thumbnail": f"https://i.ytimg.com/vi/{e.get('id')}/hqdefault.jpg",
                    "published": e.get("upload_date"),
                })
            return {"results": results, "query": q}
    except Exception as ex:
        raise HTTPException(500, str(ex))


@app.get("/api/trending")
async def trending():
    """Get trending/home feed via YouTube homepage."""
    try:
        opts = {
            **ydl_opts_base(),
            "playlistend": 20,
        }
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info("https://www.youtube.com/results?search_query=trending+italia&sp=CAISAhAB", download=False)
            entries = (info or {}).get("entries", [])
            results = []
            for e in entries:
                if not e:
                    continue
                results.append({
                    "id": e.get("id"),
                    "title": e.get("title"),
                    "channel": e.get("uploader") or e.get("channel"),
                    "duration": e.get("duration"),
                    "views": e.get("view_count"),
                    "thumbnail": f"https://i.ytimg.com/vi/{e.get('id')}/hqdefault.jpg",
                    "published": e.get("upload_date"),
                })
            return {"results": results}
    except Exception as ex:
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


@app.get("/api/stream/{video_id}")
async def stream_video(video_id: str, quality: str = "best"):
    """
    Stream video directly (no full download needed).
    Returns a redirect to the direct video URL from YouTube CDN.
    """
    try:
        format_selector = "bestvideo[height<=1080]+bestaudio/best[height<=720]/best"
        if quality == "720":
            format_selector = "bestvideo[height<=720]+bestaudio/best[height<=720]/best"
        elif quality == "480":
            format_selector = "bestvideo[height<=480]+bestaudio/best[height<=480]/best"
        elif quality == "360":
            format_selector = "best[height<=360]/best"

        opts = {
            **ydl_opts_base(),
            "extract_flat": False,
            "format": format_selector,
        }
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
            url = info.get("url") or (info.get("requested_formats") or [{}])[0].get("url")
            if not url:
                raise HTTPException(404, "No stream URL found")
            return JSONResponse({"stream_url": url, "title": info.get("title"), "ext": info.get("ext", "mp4")})
    except HTTPException:
        raise
    except Exception as ex:
        raise HTTPException(500, str(ex))


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
    scheduler.start(auth_manager, ydl_opts_base)
    # Sync immediato se già autenticato
    if auth_manager.is_authenticated():
        asyncio.create_task(scheduler.force_sync(auth_manager, ydl_opts_base))


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
    redirect_uri = "http://localhost:8080/api/auth/callback-page"
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
        redirect_uri = "http://localhost:8080/api/auth/callback-page"
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
async def subscription_feed():
    """Feed personalizzato: cookie → fallback canali iscritti."""
    results = await auth_manager.get_personalized_feed(ydl_opts_base)
    return {"results": results, "source": "cookies" if auth_manager.get_cookie_path() else "local"}


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
                if not e:
                    continue
                results.append({
                    "id": e.get("id"),
                    "title": e.get("title"),
                    "channel": e.get("uploader") or e.get("channel"),
                    "duration": e.get("duration"),
                    "views": e.get("view_count"),
                    "thumbnail": f"https://i.ytimg.com/vi/{e.get('id')}/hqdefault.jpg",
                    "published": e.get("upload_date"),
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
    return {**result, "message": f"Cookie salvati ({result['cookie_count']} cookie)"}


@app.delete("/api/cookies")
async def delete_cookies():
    auth_manager.delete_cookies()
    return {"ok": True}


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



@app.post("/api/open-vlc/{video_id}")
async def open_vlc(video_id: str, quality: str = "best"):
    """Apre il video direttamente in VLC senza scaricare nulla."""
    import shutil as _s
    vlc_path = _s.which("vlc")
    if not vlc_path:
        raise HTTPException(404, "VLC non trovato. Installa VLC con: sudo apt install vlc")
    try:
        format_selector = "bestvideo[height<=1080]+bestaudio/best[height<=720]/best"
        if quality == "720":
            format_selector = "bestvideo[height<=720]+bestaudio/best[height<=720]/best"
        elif quality == "480":
            format_selector = "best[height<=480]/best"
        elif quality == "360":
            format_selector = "best[height<=360]/best"

        opts = {**ydl_opts_base(), "extract_flat": False, "format": format_selector}
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
            # Prendi URL con audio+video se possibile
            url = None
            formats = info.get("formats", [])
            for f in reversed(formats):
                if f.get("vcodec") != "none" and f.get("acodec") != "none":
                    url = f.get("url")
                    break
            if not url:
                url = info.get("url") or (formats[-1].get("url") if formats else None)
            if not url:
                raise HTTPException(500, "Nessun formato disponibile")
            title = info.get("title", video_id)
            subprocess.Popen(
                [vlc_path, url, f"--meta-title={title}", "--no-video-title-show"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            return {"status": "ok", "title": title}
    except HTTPException:
        raise
    except Exception as ex:
        raise HTTPException(500, str(ex))

# ─── Serve React frontend ─────────────────────────────────────────────────────
frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080, reload=True)



