"""
media_finti.py — un video e un audio sintetici al posto dei due flussi
adattivi di YouTube, per provare il mux senza rete.

Stessa forma dei flussi veri: video e audio in due file separati, VP9 + Opus
in WebM (i codec che YouTube serve al player nel browser insieme all'AV1), con
un keyframe ogni `KEYFRAME_OGNI` secondi. VP9 e non H.264 per un motivo
preciso: il Chromium di Playwright non ha i codec proprietari (H.264/AAC), e
questi stessi file servono al server offline dei test del frontend
(`server_offline.py`).

Dieci minuti a risoluzione minuscola: abbastanza lunghi perché un salto al 70%
cada fuori dai `MSE_TARGET_AHEAD_S` (60s) di buffer del player, e quindi
riapra davvero `/api/mux` con `start=` — con un video da un minuto il player
lo scaricherebbe tutto subito e nessun salto passerebbe dal server.

Generati una volta sola e riusati (qualche secondo di ffmpeg): si scrive su
un temporaneo e si rinomina, così un'interruzione a metà non lascia un file
troncato che le esecuzioni successive scambierebbero per buono.
"""
import json
import shutil
import subprocess
from pathlib import Path

ID_FINTO = "ytproxyTEST"   # 11 caratteri, come un id YouTube vero
DURATA = 600
KEYFRAME_OGNI = 2
VCODEC = "vp09.00.10.08"   # stringa RFC6381, come la dà yt-dlp (X-Mux-Codecs)
ACODEC = "opus"

_SORGENTI = {
    "video.webm": ["-f", "lavfi", "-i", f"testsrc2=size=160x90:rate=15:duration={DURATA}",
                   "-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "8",
                   "-g", str(15 * KEYFRAME_OGNI), "-b:v", "60k"],
    "audio.webm": ["-f", "lavfi", "-i", f"sine=frequency=440:duration={DURATA}",
                   "-c:a", "libopus", "-b:a", "32k"],
}


def ffmpeg_disponibile() -> bool:
    return bool(shutil.which("ffmpeg") and shutil.which("ffprobe"))


def genera_media(cartella: Path) -> tuple:
    """(video, audio) dentro `cartella`, generati solo se mancano."""
    cartella.mkdir(parents=True, exist_ok=True)
    for nome, argomenti in _SORGENTI.items():
        finale = cartella / nome
        if finale.exists():
            continue
        tmp = cartella / f"parziale-{nome}"
        subprocess.run(["ffmpeg", "-v", "error", "-y", *argomenti, str(tmp)],
                       check=True, timeout=180)
        tmp.replace(finale)
    return cartella / "video.webm", cartella / "audio.webm"


def pacchetti(percorso: Path, flusso: str, quanti: int = 0) -> list:
    """
    [(pts, dimensione, flag)] dei pacchetti di un flusso (`v:0`, `a:0`).

    `quanti` > 0 legge solo i primi: sulla sorgente intera sono migliaia.
    JSON e non CSV perché nel CSV ffprobe mette i campi nel proprio ordine,
    non in quello chiesto.
    """
    intervallo = ["-read_intervals", f"%+#{quanti}"] if quanti else []
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", flusso, *intervallo,
         "-show_entries", "packet=pts_time,size,flags", "-of", "json", str(percorso)],
        capture_output=True, text=True, check=True, timeout=60).stdout
    return [(float(p["pts_time"]), int(p["size"]), p.get("flags", ""))
            for p in json.loads(out).get("packets", [])]
