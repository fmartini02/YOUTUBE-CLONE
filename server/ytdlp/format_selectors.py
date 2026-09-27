"""format_selectors.py — selettori di formato yt-dlp per la riproduzione."""

_QUALITY_HEIGHTS = {"2160": 2160, "1440": 1440, "1080": 1080, "720": 720, "480": 480, "360": 360}

# Codec che il player può chiedere (`codec=` di /api/mux) → prefisso del
# `vcodec` di yt-dlp. Il VP9 è "vp" perché yt-dlp lo scrive `vp9` nei flussi
# DASH e `vp09.…` negli HLS: `vp` li prende entrambi.
CODEC_PREFISSI = {"av1": "av01", "vp9": "vp", "h264": "avc1"}


def adaptive_format_selector(quality: str, codec: str = "") -> str:
    """
    Coppia video+audio separati alla qualità più alta disponibile: oltre i
    360p YouTube quasi mai offre un unico file già combinato, e il player
    <video> del browser non sa riprodurre due URL separati come fa VLC. Usata
    da /api/mux, che li ricompone al volo con ffmpeg.

    `quality="best"` (il default) sale fino a 2160p (4K): il remux è in sola
    copia, quindi il costo lato server è solo I/O; a decodificare il 4K
    (AV1/VP9) ci pensa il browser.

    `codec` è la scelta del dispositivo (`frontend/src/api/codecDevice.js`):
    il "migliore" per yt-dlp è quasi sempre l'AV1, che su un telefono senza
    decoder AV1 hardware va in software — un 1080p a 60 fps si blocca ogni
    pochi secondi anche col buffer pieno (misurato). Si prende il codec chiesto
    alla stessa altezza e, se il video non lo offre (l'H.264 su YouTube si
    ferma al 1080p, molti video non hanno AV1), il migliore come prima. Un
    valore sconosciuto è ignorato, così un client più nuovo non rompe niente.
    """
    h = _QUALITY_HEIGHTS.get(quality, 2160)
    generico = f"bestvideo[height<={h}]+bestaudio/best[height<={h}]/best"
    prefisso = CODEC_PREFISSI.get(codec)
    return f"bestvideo[height<={h}][vcodec^={prefisso}]+bestaudio/{generico}" if prefisso else generico


def cast_format_selector(quality: str, allow_hq: bool = False) -> str:
    """
    Formati per il Chromecast: H.264 (avc1) + AAC (mp4a).

    Il selettore normale prende il meglio in assoluto, che oggi su YouTube
    significa video AV1 e audio Opus: nessun Chromecast tranne i modelli più
    recenti sa decodificare AV1, e Opus dentro un contenitore MP4 è supportato
    male ovunque — il risultato è che la TV non riproduce nulla. H.264+AAC sono
    invece decodificati da qualunque dispositivo Cast, e su YouTube arrivano
    comunque fino a 1080p — quindi anche chiedendo 1440p/4K al Cast si resta
    tetto 1080, l'H.264 più alto che YouTube offre.

    `allow_hq=True` (solo la riproduzione Cast, non /api/download) sblocca il
    4K: oltre i 1080p YouTube non ha più H.264, e l'unico codec che un
    Chromecast 4K (Ultra, Chromecast/Google TV) decodifica a 2160p è il VP9.
    Google Cast però accetta il VP9 SOLO in un contenitore WebM con audio
    Opus/Vorbis, mai in MP4 — vedi il ramo `-f webm` di `_build_ffmpeg_cmd`
    (`server/routers/streaming.py`), scelto in base all'estensione del formato.
    Fallback all'H.264 1080 se il VP9 a quell'altezza non c'è.
    """
    if allow_hq and _QUALITY_HEIGHTS.get(quality, 0) > 1080:
        h = _QUALITY_HEIGHTS[quality]
        return (
            f"bestvideo[height<={h}][vcodec^=vp9]+bestaudio[acodec^=opus]"
            f"/bestvideo[height<={h}]+bestaudio[acodec^=opus]"
            f"/bestvideo[height<=1080][vcodec^=avc1]+bestaudio[acodec^=mp4a]"
            f"/best[height<={h}]"
        )
    h = min(_QUALITY_HEIGHTS.get(quality, 1080), 1080)
    return (
        f"bestvideo[height<={h}][vcodec^=avc1]+bestaudio[acodec^=mp4a]"
        f"/best[height<={h}][vcodec^=avc1][acodec^=mp4a]"
        f"/best[height<={h}]"
    )
