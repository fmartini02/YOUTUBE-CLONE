"""
proxy_blocchi.py — mini-proxy locale che fa scaricare a ffmpeg/ffprobe gli
URL googlevideo a blocchi chiusi, come fa yt-dlp (`http_chunk_size`).

PERCHÉ. ffmpeg su un input HTTP chiede sempre "da qui alla fine"
(`Range: bytes=N-`), e googlevideo strozza di proposito le richieste a range
aperto: misurato ~100 KB/s sul video e ~28 KB/s sull'audio, circa 2 volte il
bitrate medio, contro 10-26 MB/s dello stesso URL chiesto a blocchi chiusi
(`bytes=N-M`). In riproduzione continua 2x regge, ma ogni salto ripartiva da
zero a quella velocità: 9-12 s prima che il flusso avesse audio e video fino
a +3 s dal punto chiesto, su qualsiasi punto di un video di 70 min o di
2 h 17 min (sul telefono in più il Wi-Fi e il pre-roll del decoder). Col
proxy 0.3 s, e nel player (Chromium, viewport da telefono) il video riparte
in meno di 2 s dal salto con già un minuto di buffer davanti.

COME. ffmpeg riceve `http://127.0.0.1:<porta>/?u=<url>` al posto dell'URL
googlevideo e ci parla esattamente come prima (206, `Content-Range`, stessa
dimensione `clen`, stessi byte): la seek del demuxer atterra negli STESSI
punti — verificato, uscita di ffmpeg identica byte per byte con e senza
proxy — quindi tutta la taratura della sincronia audio/video di
`streaming.py` resta valida. Verso YouTube il proxy fa richieste chiuse da
`BLOCCO` byte, una dopo l'altra.

RITMO (`ritmo=True`, riproduzione; non `/api/download`, che vuole tutto e
subito). A piena velocità il resto del video uscirebbe in pochi secondi, e
il player non lo ferma: Chromium continua a scaricare il corpo di un
`fetch()` anche se la pompa MSE non legge — misurato ~100 MB accumulati col
lettore fermo, il tetto di `MSE_TARGET_AHEAD_S` vale solo per il
`SourceBuffer`. Quindi: i primi `RAFFICA_S` secondi di contenuto (al bitrate
medio del file, `clen`/`dur` dall'URL) a piena velocità — il salto — e poi
`RITMO` volte il bitrate medio, lo stesso margine con cui YouTube stesso
serve le richieste aperte e con cui la riproduzione continua ha sempre
retto. È un calendario, non un tetto istantaneo: dopo un calo di rete il
proxy è indietro e recupera a piena velocità.

Se googlevideo chiude una connessione a metà, il proxy riprende dal byte a
cui era arrivato invece di chiudere quella verso ffmpeg (che, senza
`-reconnect`, darebbe l'input per finito). Non osservato in 5 minuti di
download aperto, ma un blocco da 10 MB letto al ritmo sopra resta aperto
più di un minuto.

In ascolto SOLO su 127.0.0.1, porta effimera scelta dal sistema: non è
raggiungibile dalla LAN (niente proxy aperto verso googlevideo), non passa
dalla guardia di `core/security.py` e non dipende da quale `--port` è stato
dato a uvicorn. Avviato alla prima richiesta, in un thread daemon.
"""
import re
import threading
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# 10 MiB, lo stesso `CHUNK_SIZE` che yt-dlp usa per YouTube: oltre, googlevideo
# torna a strozzare anche le richieste chiuse.
BLOCCO = 10 << 20
RAFFICA_S = 120
RITMO = 2.0
_LETTURA = 1 << 16
_TIMEOUT_S = 20
# Tentativi consecutivi senza avanzare di un byte prima di arrendersi (URL
# scaduto → 403, rete giù): oltre, la connessione verso ffmpeg si chiude
# corta e il player se ne accorge come prima (fine anticipata → riapertura).
_MAX_TENTATIVI = 3

# Solo i file DASH di googlevideo: i manifest HLS delle dirette (altro percorso)
# e tutto il resto restano diretti. Niente `@` nell'host: `https://x.googlevideo.com@altro/...`
# porterebbe altrove.
_GOOGLEVIDEO = re.compile(r"https://[^/?#@]+\.googlevideo\.com/videoplayback\?")

_avvio = threading.Lock()
_porta = None


def _copia_a_blocchi(url: str, intervallo: tuple, out, ua: str, bps: float):
    """Byte `intervallo` (inclusi) di `url` verso `out` a blocchi chiusi; `bps` > 0 = col ritmo (vedi RITMO)."""
    pos, fine = intervallo
    tentativi, t0 = 0, time.monotonic()
    while pos <= fine and tentativi < _MAX_TENTATIVI:
        prima, alto = pos, min(fine, pos + BLOCCO - 1)
        req = urllib.request.Request(url, headers={"Range": f"bytes={pos}-{alto}", "User-Agent": ua})
        try:
            with urllib.request.urlopen(req, timeout=_TIMEOUT_S) as r:
                while pos <= alto and (dati := r.read(min(_LETTURA, alto - pos + 1))):
                    try:
                        out.write(dati)
                    except OSError:
                        return   # ffmpeg ha chiuso (seek, fine del flusso): basta così
                    pos += len(dati)
                    # In anticipo sul calendario (raffica + RITMO x bitrate): si aspetta.
                    anticipo = (pos - intervallo[0]) / bps - RAFFICA_S - RITMO * (time.monotonic() - t0) if bps else 0
                    if anticipo > 0:
                        time.sleep(anticipo / RITMO)
        except Exception:
            pass   # errore verso YouTube: nuovo tentativo dal byte raggiunto
        tentativi = 0 if pos > prima else tentativi + 1


def _intervallo(range_header: str, totale: int):
    """(inizio, fine) inclusi dall'header Range; None se fuori dal file."""
    m = re.match(r"bytes=(\d*)-(\d*)", range_header or "")
    if not m or not (m.group(1) or m.group(2)):
        return 0, totale - 1
    if not m.group(1):   # suffisso: gli ultimi N byte
        return max(0, totale - int(m.group(2))), totale - 1
    inizio = int(m.group(1))
    fine = min(int(m.group(2)), totale - 1) if m.group(2) else totale - 1
    return (inizio, fine) if inizio <= fine else None


class _Gestore(BaseHTTPRequestHandler):
    def do_GET(self):
        qs = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
        url = (qs.get("u") or [""])[0]
        uq = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
        if not _GOOGLEVIDEO.match(url) or not uq.get("clen"):
            self.send_error(400)
            return
        totale, dur = int(uq["clen"][0]), float((uq.get("dur") or ["0"])[0])
        ri = _intervallo(self.headers.get("Range"), totale)
        self.send_response(416 if ri is None else 206)
        self.send_header("Content-Range", f"bytes */{totale}" if ri is None else f"bytes {ri[0]}-{ri[1]}/{totale}")
        self.send_header("Content-Length", "0" if ri is None else str(ri[1] - ri[0] + 1))
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()
        if ri is not None:
            bps = totale / dur if qs.get("r") and dur > 0 else 0
            _copia_a_blocchi(url, ri, self.wfile, self.headers.get("User-Agent") or "Lavf", bps)

    def log_message(self, *args):
        pass   # una riga per ogni richiesta di ffmpeg sommergerebbe il log del server


def via_proxy(url, ritmo: bool = True):
    """
    URL da dare a ffmpeg/ffprobe al posto di `url`: il proxy a blocchi se è un
    file googlevideo, `url` stesso altrimenti. `ritmo=False` per chi vuole il
    file intero il prima possibile (`/api/download`), vedi RITMO.
    """
    global _porta
    if not (url and _GOOGLEVIDEO.match(url) and "clen=" in url):
        return url
    with _avvio:
        if _porta is None:
            srv = ThreadingHTTPServer(("127.0.0.1", 0), _Gestore)
            srv.daemon_threads = True
            threading.Thread(target=srv.serve_forever, name="proxy-blocchi", daemon=True).start()
            _porta = srv.server_address[1]
    return f"http://127.0.0.1:{_porta}/?u={urllib.parse.quote(url, safe='')}" + ("&r=1" if ritmo else "")
