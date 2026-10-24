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

_VIDEO = ["-f", "lavfi", "-i", f"testsrc2=size=160x90:rate=15:duration={DURATA}",
          "-g", str(15 * KEYFRAME_OGNI), "-b:v", "60k"]
_AUDIO = ["-f", "lavfi", "-i", f"sine=frequency=440:duration={DURATA}", "-b:a", "32k"]

# La coppia "h264" serve solo ai test del server (il Chromium di Playwright
# non la decodificherebbe): è il caso che si rompeva di più sui salti. Due
# B-frame come i flussi H.264 di YouTube, quindi dts negativo all'inizio e
# pts fuori ordine — la "dts heuristic" e l'edit list di CLAUDE.md nascono
# da qui. `-sc_threshold 0`: keyframe solo ogni KEYFRAME_OGNI, mai sui tagli.
_SORGENTI = {
    "vp9": {"video.webm": [*_VIDEO, "-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "8"],
            "audio.webm": [*_AUDIO, "-c:a", "libopus"]},
    "h264": {"video-h264.mp4": [*_VIDEO, "-c:v", "libx264", "-preset", "veryfast", "-bf", "2",
                                "-keyint_min", str(15 * KEYFRAME_OGNI), "-sc_threshold", "0"],
             "audio-aac.m4a": [*_AUDIO, "-c:a", "aac"]},
}
# La coppia "lampo" serve al test della sincronia nel browser
# (frontend/e2e/sincronia.spec.js, analisi in analizza_lampi.py): schermo
# nero con un lampo bianco di 0.1s e silenzio con un bip a 1 kHz negli STESSI
# istanti, quindi in uscita dal <video> lampi e bip devono coincidere. Gli
# istanti sono irregolari: un evento per ogni slot da 0.6s, in un punto
# pseudo-casuale dei suoi primi 0.4s (l'hash `sin` dei generatori di rumore
# GLSL). Con eventi periodici uno scarto pari a un multiplo del periodo non
# si vedrebbe, e i vecchi bug spostavano di multipli del GOP (6s, 7s); con
# slot regolari accesi o spenti, uno spostamento di qualche slot ne faceva
# coincidere quasi tutti per caso (provato). Non si usa per i test del server:
# fotogrammi neri tutti uguali renderebbero ambiguo `sincronia.scarto()`.
_INIZIO = "0.4*mod(abs(sin(floor(t/0.6)*12.9898)*43758.5453),1)"
EVENTO = f"between(mod(t,0.6)-{_INIZIO},0,0.1)"
ID_LAMPO = "ytproxyLAMP"
# Attenzione: genera_media riusa i file che trova per NOME, quindi chi cambia
# una ricetta cambia anche il nome del file, altrimenti i test continuano a
# girare sui media vecchi già in /tmp (successo con il primo schema dei lampi).
_SORGENTI["lampo"] = {
    "video-lampo.webm": ["-f", "lavfi", "-i",
                         f"color=c=black:s=160x90:r=30:d={DURATA},drawbox=c=white:t=fill:enable='{EVENTO}'",
                         "-g", str(30 * KEYFRAME_OGNI), "-b:v", "60k",
                         "-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "8"],
    "audio-lampo.webm": ["-f", "lavfi", "-i", f"aevalsrc='0.5*sin(2*PI*1000*t)*{EVENTO}':s=48000:d={DURATA}",
                         "-b:a", "32k", "-c:a", "libopus"],
}
# Le stringhe che yt-dlp darebbe per questi file (X-Mux-Codecs).
CODEC_MSE = {"vp9": (VCODEC, ACODEC), "h264": ("avc1.640009", "mp4a.40.2"), "lampo": (VCODEC, ACODEC)}


def ffmpeg_disponibile() -> bool:
    return bool(shutil.which("ffmpeg") and shutil.which("ffprobe"))


def genera_media(cartella: Path, codec: str = "vp9") -> tuple:
    """(video, audio) della coppia `codec` dentro `cartella`, generati solo se mancano."""
    cartella.mkdir(parents=True, exist_ok=True)
    for nome, argomenti in _SORGENTI[codec].items():
        finale = cartella / nome
        if finale.exists():
            continue
        tmp = cartella / f"parziale-{nome}"
        subprocess.run(["ffmpeg", "-v", "error", "-y", *argomenti, str(tmp)],
                       check=True, timeout=180)
        tmp.replace(finale)
    return tuple(cartella / nome for nome in _SORGENTI[codec])


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
