"""format_selectors.py — selettori di formato yt-dlp per la riproduzione."""

_QUALITY_HEIGHTS = {"2160": 2160, "1440": 1440, "1080": 1080, "720": 720, "480": 480, "360": 360}


def adaptive_format_selector(quality: str) -> str:
    """
    Coppia video+audio separati alla qualità più alta disponibile: oltre i
    360p YouTube quasi mai offre un unico file già combinato, e il player
    <video> del browser non sa riprodurre due URL separati come fa VLC. Usata
    da /api/mux, che li ricompone al volo con ffmpeg.

    `quality="best"` (il default) sale fino a 2160p (4K): il remux è in sola
    copia, quindi il costo lato server è solo I/O; a decodificare il 4K
    (AV1/VP9) ci pensa il browser.
    """
    h = _QUALITY_HEIGHTS.get(quality, 2160)
    return f"bestvideo[height<={h}]+bestaudio/best[height<={h}]/best"


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
