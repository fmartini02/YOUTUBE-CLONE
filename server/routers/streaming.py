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
        # WebM SOLO per il ramo Cast 4K (compat+hq, video VP9). La
        # riproduzione normale nel browser resta sempre MP4 frammentato: il
        # video VP9/AV1 di YouTube (spesso .webm) va in `-c copy` dentro l'MP4
        # come prima — è la strada su cui è tarato tutto il seek (`start=`,
        # `empty_moov`, ricodifica audio sui salti). Instradarla su `-f webm`
        # rompeva i salti su ogni video con sorgente webm.
        webm = compat and hq and video_fmt.get("ext") == "webm"
        urls = (video_fmt["url"], audio_fmt["url"], "webm" if webm else "mp4")
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


def _build_ffmpeg_cmd(video_url: str, audio_url, seek=(), container="mp4") -> list:
    """
    Comando ffmpeg che unisce video+audio adattivi (o remuxa il progressivo).
    Video sempre in sola copia; l'audio in copia tranne che sui salti — vedi
    sotto.

    Frammentazione a tempo fisso (frag_duration), non per keyframe: i video
    YouTube hanno spesso il secondo keyframe a 5-6s dall'inizio, e con
    frag_keyframe il primo blocco utilizzabile non potrebbe chiudersi prima
    di allora (misurato: da 10-15s a 1-2s di avvio con frag_duration=1s).

    SALTI (`seek` = `-ss` col secondo grezzo richiesto, prima di ogni input):
    con `-c copy` su due input HTTP separati, ognuno col proprio `-ss` e il
    proprio range request, l'MP4 che ne esce ha un buco DETERMINISTICO di ~9s
    senza un solo pacchetto video subito dopo il primo keyframe (l'audio invece
    scorre) — e il `<video>` del browser resta a bufferare all'infinito.
    Succede anche con `-ss` esatto sul keyframe, quindi non è un problema di
    allineamento: è l'interleaver di ffmpeg che, in sola copia, non riesce a
    sincronizzare i due flussi appena aperti. Ricodificare la SOLA traccia
    audio (`-c:a aac`, encoder nativo, sempre disponibile; ~130 kbit/s, costo
    trascurabile anche su un Raspberry) lo forza a riallineare e il buco
    sparisce (verificato: 6/6 salti puliti contro 6/6 col buco). Senza salto
    (`start=0`, `/api/download`) resta tutto `-c copy` come prima. Il ramo
    `webm` (Cast 4K) è lasciato in copia: l'AAC non entra in un WebM e quel
    percorso va provato con un ricevitore reale.

    Nessun probe del keyframe prima del salto: `-ss` in `-c:v copy` atterra da
    sé sull'ultimo keyframe ≤ valore (primo pacchetto video sempre `K`), e un
    `ffprobe` mirato per trovarlo costava 4-5s sul flusso 4K — tutto sul
    percorso critico del salto. In più dare a ffmpeg un `-ss` *esatto* sul
    keyframe rallentava il suo avvio di ~1.7s rispetto a un valore "largo"
    (misurato, 3/3). Il player mostra comunque `start + currentTime`: dopo un
    salto la barra può essere avanti di ≤ 1 GOP (qui ~3s) rispetto al
    fotogramma, offset fisso che non deriva — come lo snap ai segmenti di
    YouTube. Il probe (`_keyframe_before`, finestra `ffprobe`) è stato rimosso.

    `container="webm"` è il ramo del Chromecast in 4K: Google Cast decodifica
    il VP9 solo dentro un WebM, mai in MP4. `-live 1` mette il muxer Matroska
    in modalità flusso (niente seek all'indietro per scrivere Cues/durata a
    fine stream, come `empty_moov` per l'MP4); `cluster_time_limit` 1s dà lo
    stesso avvio rapido di `frag_duration`.
    """
    base = [_FFMPEG_BIN, "-loglevel", "error"]
    reencode_audio = bool(audio_url and seek and container == "mp4")
    acodec = ["-c:v", "copy", "-c:a", "aac", "-b:a", "160k"] if reencode_audio else ["-c", "copy"]
    if audio_url:
        cmd = [*base, *seek, "-i", video_url, *seek, "-i", audio_url,
               "-map", "0:v:0", "-map", "1:a:0", *acodec]
    else:
        cmd = [*base, *seek, "-i", video_url, *acodec]
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

    Sul salto lo stesso `-ss` (il secondo grezzo richiesto) va a video e audio
    prima dei rispettivi input; ffmpeg in `-c:v copy` atterra da sé sul
    keyframe precedente, quindi si "atterra" fino a ~1 GOP prima del punto
    cliccato, come lo snap ai segmenti del player di YouTube. Nessun `ffprobe`
    del keyframe prima del salto: costava 4-5s sul percorso critico e non
    serviva più. Il buco audio/video che `-c copy` lasciava dopo ogni salto
    (player a bufferare all'infinito) è risolto in `_build_ffmpeg_cmd`
    ricodificando la sola traccia audio.
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
