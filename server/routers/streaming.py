"""
streaming.py — /api/mux (riproduzione) e /api/download, entrambi remux ffmpeg
in tempo reale dei flussi video+audio adattivi di YouTube. Vedi CLAUDE.md
("Riproduzione: due selettori di formato, due scopi") per il quadro completo.
"""
import asyncio
import shutil
import subprocess
import time

from fastapi import APIRouter, HTTPException

from auth.cookie_session import crea_ydl
from ytdlp.format_selectors import adaptive_format_selector, cast_format_selector
from routers.ffmpeg_pipe import ffmpeg_pipe_response
from ytdlp.helpers import ydl_opts_base

router = APIRouter()

_FFMPEG_BIN = shutil.which("ffmpeg") or "ffmpeg"
_FFPROBE_BIN = shutil.which("ffprobe") or "ffprobe"

# Cache degli URL di formato usati da /api/mux e /api/download. Serve al
# seek: saltare in un altro punto del video significa riavviare ffmpeg, e
# senza cache ogni salto ripagherebbe l'estrazione yt-dlp (1-3 secondi)
# prima ancora di iniziare a scaricare. Gli URL googlevideo restano validi
# diverse ore, ma 30 minuti tengono il margine largo.
_mux_fmt_cache: dict = {}
_MUX_FMT_CACHE_TTL = 1800


def _mux_formats(video_id: str, quality: str, compat: bool, hq: bool = False):
    """URL video+audio (o singolo URL progressivo) più il contenitore, con cache."""
    key = (video_id, quality, compat, hq)
    hit = _mux_fmt_cache.get(key)
    if hit and time.time() - hit[0] < _MUX_FMT_CACHE_TTL:
        return hit[1]

    # compat=1 (usato dal Chromecast): forza H.264+AAC invece del meglio
    # assoluto, che sarebbe AV1+Opus e la TV non lo riprodurrebbe. hq=1 (solo
    # la riproduzione Cast) sblocca il 4K in VP9, che però va servito in WebM.
    selector = cast_format_selector(quality, hq) if compat else adaptive_format_selector(quality)
    opts = {**ydl_opts_base(), "extract_flat": False, "format": selector}
    with crea_ydl(opts) as ydl:
        info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)

    requested = info.get("requested_formats")
    if requested and len(requested) >= 2:
        video_fmt = next((f for f in requested if f.get("vcodec") != "none"), requested[0])
        audio_fmt = next((f for f in requested if f.get("acodec") != "none" and f.get("vcodec") == "none"), requested[-1])
        cont = "webm" if video_fmt.get("ext") == "webm" else "mp4"
        urls = (video_fmt["url"], audio_fmt["url"], cont)
    else:
        url = info.get("url")
        if not url:
            return None
        urls = (url, None, "mp4")

    _mux_fmt_cache[key] = (time.time(), urls)
    # Potatura opportunistica: senza, la cache cresce per tutta la vita del
    # processo su un server che resta acceso per giorni.
    if len(_mux_fmt_cache) > 64:
        now = time.time()
        for k in [k for k, v in _mux_fmt_cache.items() if now - v[0] >= _MUX_FMT_CACHE_TTL]:
            _mux_fmt_cache.pop(k, None)
    return urls


def _keyframe_before(video_url: str, start: float) -> float:
    """
    Ultimo keyframe video a `start` o prima. Serve al seek: in sola copia il
    flusso non può partire da metà GOP. `-ss` prima dell'input porta comunque
    al keyframe precedente — video subito ma audio disallineato di qualche
    secondo — mentre `-copypriorss 0` aspetta il keyframe *successivo* (diversi
    secondi di caricamento) e vicino alla fine del video, dove un keyframe dopo
    non c'è, dà un flusso senza video che pianta anche l'audio. Allineando
    `-ss` di *entrambi* gli input a questo keyframe: video immediato, audio in
    sincrono, nessun buco. La finestra di 15s tiene il probe a una range
    request delimitata (~15s di video, non l'intero file) e copre anche i GOP
    lunghi di YouTube; su un 4K sono comunque decine di MB per salto — se pesa,
    l'ottimizzazione è una cache del GOP per video.
    """
    frm = max(0.0, start - 15.0)
    cmd = [_FFPROBE_BIN, "-loglevel", "error", "-select_streams", "v",
           "-skip_frame", "nokey", "-show_entries", "frame=pts_time",
           "-of", "csv=p=0", "-read_intervals", f"{frm:.3f}%{start:.3f}", video_url]
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=8).stdout
    except (subprocess.SubprocessError, OSError):
        return start
    keys = []
    for tok in out.replace(",", " ").split():   # csv a volte lascia una virgola in coda
        try:
            keys.append(float(tok))
        except ValueError:
            pass
    keys = [k for k in keys if k <= start + 0.001]
    return max(keys) if keys else start


def _build_ffmpeg_cmd(video_url: str, audio_url, seek=(), container="mp4") -> list:
    """
    Comando ffmpeg in sola copia (-c copy, nessuna transcodifica): unisce
    video+audio se separati, altrimenti fa solo remux del progressivo.

    Frammentazione a tempo fisso (frag_duration), non per keyframe: i video
    YouTube hanno spesso il secondo keyframe a 5-6s dall'inizio, e con
    frag_keyframe il primo blocco utilizzabile non potrebbe chiudersi prima
    di allora (misurato: da 10-15s a 1-2s di avvio con frag_duration=1s).

    `seek` (`-ss` prima di ogni input) è già allineato a un keyframe da
    `_keyframe_before`, quindi niente `-copypriorss`: si parte esatti sul
    keyframe, senza spezzone da scartare né attesa di quello dopo.

    `container="webm"` è il ramo del Chromecast in 4K: Google Cast decodifica
    il VP9 solo dentro un WebM, mai in MP4. `-live 1` mette il muxer Matroska
    in modalità flusso (niente seek all'indietro per scrivere Cues/durata a
    fine stream, come `empty_moov` per l'MP4); `cluster_time_limit` 1s dà lo
    stesso avvio rapido di `frag_duration`.
    """
    base = [_FFMPEG_BIN, "-loglevel", "error"]
    if audio_url:
        cmd = [*base, *seek, "-i", video_url, *seek, "-i", audio_url,
               "-map", "0:v:0", "-map", "1:a:0", "-c", "copy"]
    else:
        cmd = [*base, *seek, "-i", video_url, "-c", "copy"]
    if container == "webm":
        return [*cmd, "-live", "1", "-cluster_time_limit", "1000", "-f", "webm", "pipe:1"]
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

    In sola copia il flusso non può partire da metà GOP: `start` viene
    riportato all'ultimo keyframe video che lo precede (`_keyframe_before`) e
    lo stesso `-ss` va a video e audio, così partono in sincrono e senza
    attese. Si "atterra" fino a ~1 GOP prima del punto cliccato, come lo snap
    ai segmenti del player di YouTube.
    """
    try:
        urls = await asyncio.get_running_loop().run_in_executor(
            None, _mux_formats, video_id, quality, compat, compat
        )
    except Exception as ex:
        raise HTTPException(500, str(ex))
    if not urls:
        raise HTTPException(404, "Nessun formato disponibile")

    video_url, audio_url, container = urls
    start = max(0.0, start)
    if start > 0:
        start = await asyncio.get_running_loop().run_in_executor(
            None, _keyframe_before, video_url, start
        )
    seek = ["-ss", f"{start:.3f}"] if start > 0 else []
    cmd = _build_ffmpeg_cmd(video_url, audio_url, seek=seek, container=container)

    # Accept-Ranges: none dichiarato esplicitamente — senza, il browser manda
    # "Range: bytes=0-" e riceve un 200 invece del 206 che si aspetta,
    # ritardando l'avvio dello streaming progressivo di diversi secondi.
    return await ffmpeg_pipe_response(
        cmd, f"mux {video_id} (quality={quality}, start={start})",
        headers={"Accept-Ranges": "none"}, media_type=f"video/{container}",
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

    video_url, audio_url, _cont = urls
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
