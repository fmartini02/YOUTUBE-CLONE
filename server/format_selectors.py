"""format_selectors.py — selettori di formato yt-dlp per la riproduzione."""

_QUALITY_HEIGHTS = {"1080": 1080, "720": 720, "480": 480, "360": 360}


def adaptive_format_selector(quality: str) -> str:
    """
    Coppia video+audio separati alla qualità più alta disponibile: oltre i
    360p YouTube quasi mai offre un unico file già combinato, e il player
    <video> del browser non sa riprodurre due URL separati come fa VLC. Usata
    da /api/mux, che li ricompone al volo con ffmpeg.
    """
    h = _QUALITY_HEIGHTS.get(quality, 1080)
    return f"bestvideo[height<={h}]+bestaudio/best[height<={h}]/best"


def cast_format_selector(quality: str) -> str:
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
