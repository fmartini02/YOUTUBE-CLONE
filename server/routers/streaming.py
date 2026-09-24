"""
streaming.py — /api/mux (riproduzione) e /api/download, entrambi remux ffmpeg
in tempo reale dei flussi video+audio adattivi di YouTube. Vedi CLAUDE.md
("Riproduzione: due selettori di formato, due scopi") per il quadro completo.
"""
import asyncio
import math
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
_KEYFRAME_PROBE_TIMEOUT = 8
# 3/23s (l'arretramento della "dts heuristic" di ffmpeg sugli input con
# B-frame) arrotondato per eccesso al millesimo — vedi _build_ffmpeg_cmd.
_DTS_EURISTICA = 0.131

# Cache degli URL di formato usati da /api/mux e /api/download. Serve al
# seek: saltare in un altro punto del video significa riavviare ffmpeg, e
# senza cache ogni salto ripagherebbe l'estrazione yt-dlp (1-3 secondi)
# prima ancora di iniziare a scaricare. Gli URL googlevideo restano validi
# diverse ore, ma 30 minuti tengono il margine largo.
_mux_fmt_cache: dict = {}
_MUX_FMT_CACHE_TTL = 1800

# Cache di _keyframe_before: stesso TTL di _mux_fmt_cache (entrambe legate
# alla validità dell'URL googlevideo), tetto più alto perché la chiave include
# anche il punto del salto, non solo il video.
_keyframe_cache: dict = {}


def _mux_formats(video_id: str, quality: str, compat: bool, hq: bool = False):
    """
    URL video+audio (o singolo URL progressivo), contenitore e codec sorgente,
    con cache. I codec (stringhe RFC6381, es. `av01.0.05M.08`/`opus`) li dà
    già yt-dlp nei dizionari formato: servono al frontend per MediaSource
    (serve un `SourceBuffer` col codec ESATTO, sennò `appendBuffer` fallisce)
    — vedi l'header `X-Mux-Codecs` in `mux_stream`.
    """
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
        urls = (video_fmt["url"], audio_fmt["url"], "webm" if webm else "mp4", video_fmt.get("vcodec") or "", audio_fmt.get("acodec") or "")
    else:
        url = info.get("url")
        if not url:
            return None
        urls = (url, None, "mp4", info.get("vcodec") or "", info.get("acodec") or "")

    _mux_fmt_cache[key] = (time.time(), urls)
    # Potatura opportunistica: senza, la cache cresce per tutta la vita del
    # processo su un server che resta acceso per giorni.
    if len(_mux_fmt_cache) > 64:
        now = time.time()
        for k in [k for k, v in _mux_fmt_cache.items() if now - v[0] >= _MUX_FMT_CACHE_TTL]:
            _mux_fmt_cache.pop(k, None)
    return urls


def _keyframe_before(video_url: str, target: float) -> float:
    """
    Timestamp del keyframe video <= target, con un probe minimo (pochissimi
    fotogrammi, non un'intera finestra come il vecchio `_keyframe_before`
    rimosso in 43a6d9e). Serve a dare all'audio ricodificato lo STESSO punto
    di atterraggio del video in sola copia: senza, `-ss` grezzo fa atterrare
    il video sul keyframe precedente (fino a un GOP prima, misurato 0.6-2.7s
    su YouTube) mentre l'audio (decodificato) atterra quasi esatto sul
    target, e i due flussi restano permanentemente sfasati per tutto il
    resto della riproduzione una volta rimappati a pts 0 dal muxer — non il
    semplice offset "barra avanti sul fotogramma" già accettato (vedi
    CLAUDE.md), un vero disallineamento udibile fra audio e video.

    Serve SOLO al flusso "relativo" (ripiego `<video src>`, Cast): il player
    MSE chiede `tempi=sorgente` e non ne ha bisogno — vedi `mux_stream`, dove
    è spiegato perché quella strada è sincronizzata per costruzione e questa
    no.

    `read_intervals "target%+#1"` fa fare a ffprobe la seek del demuxer
    (keyframe <= target, per inizio di segmento sugli URL DASH) e legge il
    primo PACCHETTO che ne esce, col suo flag K: niente decoder da
    inizializzare, a differenza dei 3 fotogrammi decodificati (`pict_type=I`)
    letti prima. Attenzione però: ffmpeg NON fa la stessa seek quando
    l'input video ha B-frame (H.264, ramo Cast) — cerca a `-ss − 3/23s` —
    quindi il valore restituito qui non va passato così com'è all'input
    video: ci pensa `_build_ffmpeg_cmd` (vedi `_DTS_EURISTICA`). Senza,
    `-ss 121.72` faceva atterrare il video a 114.72 con l'audio a 121.72: 7s
    di desincronia per tutto il resto del video.

    Il timeout (`_KEYFRAME_PROBE_TIMEOUT`) è largo di proposito: la seek
    stessa sugli URL googlevideo varia da 0.7 a 5.7s (misurato, stesso video,
    punti diversi), e a timeout si ripiega sul valore grezzo — cioè sulla
    desincronia di un intero segmento (1.7s misurati a 3s di timeout). Un
    salto che parte un po' più tardi è meglio di un salto fuori sincrono.

    Cache come `_mux_fmt_cache` qui sopra e per lo stesso motivo: un salto
    ripetuto sullo stesso punto (tasti freccia premuti in rapida sequenza,
    verificato dal vivo) ripagherebbe ogni volta un intero processo ffprobe
    invece di riusare il risultato appena calcolato.

    Il risultato è arrotondato PER ECCESSO al millesimo, mai al più vicino: il
    chiamante lo passa a ffmpeg come `-ss` con 3 decimali, e ffmpeg atterra
    sull'inizio di segmento <= quel valore. Un keyframe a 60.958333 (tipico a
    24 fps) scritto "60.958" cade un soffio PRIMA di sé stesso, e ffmpeg
    torna indietro di un intero segmento DASH (misurato: a 55.0, 6s prima)
    mentre `X-Mux-Start` e l'audio ricodificato restano su 60.958 — buco
    audio iniziale di 6s e barra del player avanti di tutto lo scarto (12s
    su un salto a 67.2), che arrivava alla fine del video con ancora 11s da
    riprodurre: il "salto alla fine da solo" vicino alla fine del video.
    Per eccesso basta un millisecondo, sempre meno di un fotogramma.
    """
    if target <= 0:
        return target
    key = (video_url, round(target, 3))
    hit = _keyframe_cache.get(key)
    if hit and time.time() - hit[0] < _MUX_FMT_CACHE_TTL:
        return hit[1]
    cmd = [_FFPROBE_BIN, "-v", "error", "-select_streams", "v:0",
           "-show_entries", "packet=pts_time,flags",
           "-read_intervals", f"{target:.3f}%+#1", "-of", "csv=p=0", video_url]
    result = target
    try:
        out = subprocess.run(cmd, capture_output=True, text=True,
                              timeout=_KEYFRAME_PROBE_TIMEOUT).stdout
        for line in out.splitlines():
            pts, _, flag = line.partition(",")
            if flag.startswith("K"):
                result = math.ceil(float(pts) * 1000) / 1000
                break
    except Exception:
        pass
    _keyframe_cache[key] = (time.time(), result)
    if len(_keyframe_cache) > 256:
        for k in [k for k, v in _keyframe_cache.items() if time.time() - v[0] >= _MUX_FMT_CACHE_TTL]:
            _keyframe_cache.pop(k, None)
    return result


def _build_ffmpeg_cmd(video_url: str, audio_url, seek=0.0, container="mp4", audio_aac=False) -> list:
    """
    Comando ffmpeg che unisce video+audio adattivi (o remuxa il progressivo).
    Video sempre in sola copia; l'audio in copia tranne che sui salti della
    timeline relativa — vedi sotto. `seek`: secondo da cui partire (0 = dall'inizio).

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
    percorso va provato con un ricevitore reale. Sulla timeline sorgente
    (`mp4_sorgente`, sotto) il buco non si presenta — misurato: distanza
    massima fra due pacchetti video 0.040s, un fotogramma, su 8 salti — e
    l'audio resta in copia anche sui salti: niente ricodifica, stesso codec
    della partenza da 0.

    SALTI SULLA TIMELINE RELATIVA: video e audio devono condividere lo stesso
    riferimento temporale E l'audio non deve partire dopo il video (il muxer
    rappresenterebbe lo scarto "stirando" il primo campione audio, che il
    browser suona per 21ms invece che per tutta la sua durata: audio in
    anticipo di tutto lo scarto — vedi `mux_stream`). `seek` qui è il
    keyframe di `_keyframe_before`, e all'input video si dà `seek +
    _DTS_EURISTICA` con `-itsoffset` dello stesso valore. Perché: quando
    l'input video ha B-frame (H.264, il ramo Cast), `fftools` non cerca a
    `-ss` ma a `-ss − 3/23s` ("dts heuristic" in ffmpeg_demux.c), e un `-ss`
    esattamente sul keyframe torna indietro di un intero segmento DASH
    (misurato: 5.2s e 7s, audio avanti di altrettanto per tutto il video).
    Il margine riporta la ricerca sul keyframe (AV1/VP9, senza euristica,
    atterrano comunque su quell'inizio di segmento: il successivo è secondi
    più in là) e `-itsoffset` sottrae lo stesso margine dalla timeline del
    video, che resta allineata a quella dell'audio. Misurato: H.264 +16.8ms,
    AV1 −6.9ms (prima, H.264: 5.2-7s).

    `container="mp4_sorgente"`: stesso MP4 frammentato, ma con i TEMPI VERI
    della sorgente su ogni campione di ogni traccia (lo chiede il player MSE,
    vedi `mux_stream`). Tre opzioni, tutte necessarie — misurate una per una:
    - `-copyts`: niente sottrazione del `-ss`, i pacchetti restano sul tempo
      del video originale (video dal keyframe, audio dal secondo chiesto);
    - `-avoid_negative_ts make_non_negative` + `frag_discont`: il muxer, di
      suo, riporta a 0 il primo campione di OGNI traccia per conto proprio
      (`make_zero` automatico senza edit list) — `frag_discont` gli fa
      scrivere nel `tfdt` il tempo vero del primo pacchetto invece di 0, e
      `make_non_negative` toglie quel `make_zero`;
    - `-use_editlist 0`: altrimenti, con `frag_discont`, il muxer sposta in
      avanti il video del ritardo di riordino dei B-frame (H.264: +40ms, il
      primo campione usciva con pts 121.76 invece di 121.72).
    Verificato sul contenuto (pacchetti video accoppiati alla sorgente,
    correlazione dell'audio con quella originale): 0.0 ms su AV1+Opus e
    H.264+AAC, anche dove il flusso relativo sbagliava di 1.7s e 7s.

    `container="webm"` è il ramo del Chromecast in 4K: Google Cast decodifica
    il VP9 solo dentro un WebM, mai in MP4. `-live 1` mette il muxer Matroska
    in modalità flusso (niente seek all'indietro per scrivere Cues/durata a
    fine stream, come `empty_moov` per l'MP4); `cluster_time_limit` 1s dà lo
    stesso avvio rapido di `frag_duration`.
    """
    sorgente = container == "mp4_sorgente"
    base = [_FFMPEG_BIN, "-loglevel", "error", *(["-copyts"] if sorgente else [])]
    # `audio_aac` arriva già decisa dal chiamante (non ricalcolata qui):
    # serve anche per l'header `X-Mux-Codecs` di `mux_stream`, che deve
    # sapere PRIMA di lanciare ffmpeg quale codec sta per uscire.
    acodec = ["-c:v", "copy", "-c:a", "aac", "-b:a", "160k"] if audio_aac else ["-c", "copy"]
    ss = ["-ss", f"{seek:.3f}"] if seek > 0 else []
    if audio_url:
        relativo = bool(ss) and container == "mp4"
        ss_video = ["-ss", f"{seek + _DTS_EURISTICA:.3f}", "-itsoffset", f"{_DTS_EURISTICA:.3f}"] if relativo else ss
        cmd = [*base, *ss_video, "-i", video_url, *ss, "-i", audio_url,
               "-map", "0:v:0", "-map", "1:a:0", *acodec]
    else:
        cmd = [*base, *ss, "-i", video_url, *acodec]
    if container == "webm":
        return [*cmd, "-live", "1", "-cluster_time_limit", "1000", "-f", "webm", "pipe:1"]
    if sorgente:
        cmd += ["-avoid_negative_ts", "make_non_negative", "-use_editlist", "0"]
    movflags = "empty_moov+default_base_moof" + ("+frag_discont" if sorgente else "")
    return [*cmd, "-movflags", movflags,
            "-frag_duration", "1000000", "-f", "mp4", "pipe:1"]


@router.get("/api/mux/{video_id}")
async def mux_stream(video_id: str, quality: str = "best", compat: bool = False, start: float = 0, tempi: str = ""):
    """
    Streaming ad alta qualità: unisce al volo con ffmpeg i flussi video e
    audio separati che YouTube offre oltre i 360p.

    Il flusso è generato in tempo reale, senza Content-Length né supporto
    Range: da qui il parametro `start` — invece di chiedere al browser di
    cercare dentro un flusso non cercabile, il player ricomincia il flusso
    dal secondo richiesto (ffmpeg `-ss` prima degli input, sul Range degli
    URL googlevideo) e mostra `start + currentTime` come posizione.

    SINCRONIA AUDIO/VIDEO SUI SALTI — `tempi=sorgente` (player MSE). Dopo un
    `-ss` il video in copia parte dal keyframe (anche secondi prima), l'audio
    dal secondo chiesto: la timeline interna di ffmpeg è comunque coerente
    (verificato con `-debug_ts`), ma il muxer fMP4 senza edit list porta a 0
    il primo campione di ogni traccia e rappresenta quella partita DOPO
    "stirandone" il primo campione (una durata di 1.7s, 7s...). Il video
    stirato è innocuo (un fotogramma tenuto più a lungo); l'audio no: il
    browser suona i campioni uno dopo l'altro ignorando quella durata, e
    l'audio anticipa il video esattamente dello scarto, per tutto il resto
    del video. È la causa di OGNI desincronia vista finora su questo player
    (probe in timeout → 1.7s; I-frame non IDR sull'H.264 → 7s; keyframe
    arrotondato per difetto → 6s). Con `tempi=sorgente` ogni campione porta
    il suo tempo vero (vedi `mp4_sorgente` in `_build_ffmpeg_cmd`) e il
    `SourceBuffer` in modalità "segments" li mette in fila da sé, come fa il
    player di YouTube coi segmenti DASH: sincronizzati per costruzione, senza
    probe (quindi anche 1-5s più veloci a partire) e senza ipotesi sulla
    distanza fra keyframe. L'header `X-Mux-Timeline: sorgente` dice al player
    che la richiesta è stata onorata: un server vecchio non lo manda, e un
    APK nuovo collegato a un server vecchio resta sulla timeline relativa.

    Senza `tempi` (ripiego `<video src>`, Cast): la timeline resta relativa
    (parte da 0), perché un lettore nativo che riceve tempi da 57s non la
    mostra in modo prevedibile e non gli si può spostare il playhead in un
    flusso non cercabile. Lì la sincronia dipende ancora dal probe qui sotto.

    Sul salto, `_keyframe_before` trova con un probe minimo il keyframe video
    <= al secondo richiesto (ffmpeg in `-c:v copy` ci atterrerebbe comunque
    da sé, ma senza saperlo in anticipo) e lo usa come `-ss` per ENTRAMBI gli
    input: prima che ci fosse questo passaggio, l'audio ricodificato (vedi
    `_build_ffmpeg_cmd`) atterrava quasi esatto sul secondo grezzo mentre il
    video restava sul keyframe precedente, fino a un GOP prima — risultato,
    audio e video permanentemente sfasati per tutto il resto della
    riproduzione. Il vecchio probe (finestra intera, 4-5s su un 4K) era stato
    tolto dal percorso critico in 43a6d9e; questo legge solo pochi fotogrammi
    e costa ~1s (misurato). Il buco audio/video che `-c copy` lasciava dopo
    ogni salto (player a bufferare all'infinito) resta risolto in
    `_build_ffmpeg_cmd` ricodificando la sola traccia audio.
    """
    try:
        urls = await asyncio.get_running_loop().run_in_executor(
            None, _mux_formats, video_id, quality, compat, compat
        )
    except Exception as ex:
        raise HTTPException(500, str(ex))
    if not urls:
        raise HTTPException(404, "Nessun formato disponibile")

    video_url, audio_url, container, vcodec, acodec = urls
    start = max(0.0, start)
    sorgente = tempi == "sorgente" and container == "mp4"
    # Il probe serve solo alla timeline relativa: con quella sorgente il
    # `-ss` resta il secondo grezzo e ogni traccia parte dove può.
    probe = start > 0 and audio_url and container == "mp4" and not sorgente
    seek_target = (await asyncio.get_running_loop().run_in_executor(None, _keyframe_before, video_url, start)) if probe else start
    audio_aac = bool(audio_url and seek_target > 0 and container == "mp4" and not sorgente)
    cmd = _build_ffmpeg_cmd(video_url, audio_url, seek=seek_target, container="mp4_sorgente" if sorgente else container, audio_aac=audio_aac)

    # Accept-Ranges: none dichiarato esplicitamente — senza, il browser manda
    # "Range: bytes=0-" e riceve un 200 invece del 206 che si aspetta,
    # ritardando l'avvio dello streaming progressivo di diversi secondi.
    # X-Mux-Codecs/X-Mux-Start: per il player MSE (vedi frontend), che deve
    # creare il SourceBuffer col codec ESATTO e allineare la sua timeline al
    # keyframe vero (non al `start` grezzo richiesto) prima di ricevere byte.
    # `expose_headers` in main.py li rende leggibili anche da un `fetch()`
    # cross-origin (APK su un'altra origine del server sulla LAN). Solo sul
    # ramo mp4: sul ramo webm (Cast 4K) i codec sorgente descriverebbero un
    # contenitore diverso da quello che il player MSE assume (`video/mp4`) —
    # oggi quel ramo non passa mai di qui, ma un header assente fa fallire
    # `creaFlussoMse` in modo pulito invece di dichiarare un mime sbagliato.
    headers = {"Accept-Ranges": "none"}
    if container == "mp4":
        headers["X-Mux-Codecs"] = f"{vcodec},{'mp4a.40.2' if audio_aac else acodec}"
        # Con `tempi=sorgente` non c'è un "punto di atterraggio" da dichiarare:
        # ogni campione porta già il suo tempo vero.
        headers.update({"X-Mux-Timeline": "sorgente"} if sorgente else {"X-Mux-Start": f"{seek_target:.3f}"})
    return await ffmpeg_pipe_response(
        cmd, f"mux {video_id} (quality={quality}, start={start})",
        headers=headers, media_type=f"video/{container}",
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

    video_url, audio_url, _cont, _vcodec, _acodec = urls
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
