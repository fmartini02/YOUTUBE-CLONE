"""
streaming.py — /api/mux (riproduzione) e /api/download, entrambi remux ffmpeg
in tempo reale dei flussi video+audio adattivi di YouTube. Vedi CLAUDE.md
("Riproduzione: due selettori di formato, due scopi") per il quadro completo.
"""
import asyncio
import shutil
import time

from fastapi import APIRouter, HTTPException

from auth.cookie_session import crea_ydl
from ytdlp.format_selectors import adaptive_format_selector, cast_format_selector
from routers.ffmpeg_pipe import ffmpeg_pipe_response
from ytdlp.helpers import ydl_opts_base

router = APIRouter()

_FFMPEG_BIN = shutil.which("ffmpeg") or "ffmpeg"

# Cache degli URL di formato usati da /api/mux e /api/download. Serve al
# seek: saltare in un altro punto del video significa riavviare ffmpeg, e
# senza cache ogni salto ripagherebbe l'estrazione yt-dlp (1-3 secondi)
# prima ancora di iniziare a scaricare. Gli URL googlevideo restano validi
# diverse ore, ma 30 minuti tengono il margine largo.
_mux_fmt_cache: dict = {}
_MUX_FMT_CACHE_TTL = 1800


def _mux_formats(video_id: str, quality: str, compat: bool):
    """URL video+audio (o singolo URL progressivo), con cache."""
    key = (video_id, quality, compat)
    hit = _mux_fmt_cache.get(key)
    if hit and time.time() - hit[0] < _MUX_FMT_CACHE_TTL:
        return hit[1]

    # compat=1 (usato dal Chromecast): forza H.264+AAC invece del meglio
    # assoluto, che sarebbe AV1+Opus e la TV non lo riprodurrebbe.
    selector = cast_format_selector(quality) if compat else adaptive_format_selector(quality)
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

    _mux_fmt_cache[key] = (time.time(), urls)
    # Potatura opportunistica: senza, la cache cresce per tutta la vita del
    # processo su un server che resta acceso per giorni.
    if len(_mux_fmt_cache) > 64:
        now = time.time()
        for k in [k for k, v in _mux_fmt_cache.items() if now - v[0] >= _MUX_FMT_CACHE_TTL]:
            _mux_fmt_cache.pop(k, None)
    return urls


def _build_ffmpeg_cmd(video_url: str, audio_url, extra_output=(), seek=()) -> list:
    """
    Comando ffmpeg in sola copia (-c copy, nessuna transcodifica): unisce
    video+audio se separati, altrimenti fa solo remux del progressivo.

    Frammentazione a tempo fisso (frag_duration), non per keyframe: i video
    YouTube hanno spesso il secondo keyframe a 5-6s dall'inizio, e con
    frag_keyframe il primo blocco utilizzabile non potrebbe chiudersi prima
    di allora (misurato: da 10-15s a 1-2s di avvio con frag_duration=1s).
    """
    base = [_FFMPEG_BIN, "-loglevel", "error"]
    if audio_url:
        cmd = [*base, *seek, "-i", video_url, *seek, "-i", audio_url,
               "-map", "0:v:0", "-map", "1:a:0", "-c", "copy", *extra_output]
    else:
        cmd = [*base, *seek, "-i", video_url, "-c", "copy", *extra_output]
    return [*cmd, "-movflags", "empty_moov+default_base_moof",
            "-frag_duration", "1000000", "-f", "mp4", "pipe:1"]


@router.get("/api/mux/{video_id}")
async def mux_stream(video_id: str, quality: str = "best", compat: bool = False, start: float = 0):
    """
    Streaming ad alta qualità: unisce al volo con ffmpeg i flussi video e
    audio separati che YouTube offre oltre i 360p.

    Il flusso è generato in tempo reale, senza Content-Length né supporto
    Range: da qui il parametro `start` — invece di chiedere al browser di
    cercare dentro un flusso non cercabile, il player ricomincia il flusso
    dal secondo richiesto (ffmpeg `-ss` prima degli input, sul Range degli
    URL googlevideo) e mostra `start + currentTime` come posizione.

    `-copypriorss 0` (solo quando si cerca davvero) scarta il keyframe che
    precede il punto richiesto: senza, ffmpeg in sola copia produce un
    flusso che comincia con un fotogramma fermo fino al punto vero (misurato
    fino a 7s di immagine congelata) e un audio ~10s in anticipo.
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
    seek = ["-ss", f"{start:.3f}"] if start > 0 else []
    prior = ["-copypriorss", "0"] if start > 0 else []
    cmd = _build_ffmpeg_cmd(video_url, audio_url, extra_output=prior, seek=seek)

    # Accept-Ranges: none dichiarato esplicitamente — senza, il browser manda
    # "Range: bytes=0-" e riceve un 200 invece del 206 che si aspetta,
    # ritardando l'avvio dello streaming progressivo di diversi secondi.
    return await ffmpeg_pipe_response(
        cmd, f"mux {video_id} (quality={quality}, start={start})",
        headers={"Accept-Ranges": "none"},
    )


@router.get("/api/download/{video_id}")
async def download_video(video_id: str, quality: str = "best"):
    """
    Scarica il video come MP4, in streaming (stesso remux ffmpeg di
    /api/mux) ma con `Content-Disposition: attachment` e i codec
    "compatibili" del Chromecast (H.264+AAC): un file che resta sul disco
    deve aprirsi anche fuori da un browser aggiornato, e il meglio assoluto
    di YouTube oggi è AV1+Opus.
    """
    try:
        urls = await asyncio.get_running_loop().run_in_executor(
            None, _mux_formats, video_id, quality, True
        )
    except Exception as ex:
        raise HTTPException(500, str(ex))
    if not urls:
        raise HTTPException(404, "Nessun formato disponibile")

    video_url, audio_url = urls
    cmd = _build_ffmpeg_cmd(video_url, audio_url)

    # Il nome del file lo mette il frontend con l'attributo `download` del
    # link (è il titolo del video); qui basta un ripiego sicuro.
    return await ffmpeg_pipe_response(
        cmd, f"download {video_id} (quality={quality})",
        headers={
            "Content-Disposition": f'attachment; filename="{video_id}.mp4"',
            "Accept-Ranges": "none",
        },
    )
