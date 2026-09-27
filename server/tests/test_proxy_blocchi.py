"""
ytdlp/proxy_blocchi.py: il proxy locale che fa scaricare a ffmpeg gli URL
googlevideo a blocchi chiusi. googlevideo è finto (`_urlopen_finto`): qui
interessa che le richieste verso YouTube siano chiuse, che i byte verso ffmpeg
siano esattamente quelli del file e che il ritmo segua il calendario.
"""
import functools
import http.client
import io
import urllib.parse

from ytdlp import proxy_blocchi as pb

URL = "https://rr1---sn-abc.googlevideo.com/videoplayback?itag=399&clen=1000&dur=10.0"
DATI = bytes(i % 251 for i in range(1000))


def _urlopen_finto(richieste: list, taglio: int, req, timeout=None):
    """googlevideo finto: serve il Range chiesto, ma al massimo `taglio` byte per risposta."""
    inizio, fine = map(int, req.get_header("Range").split("=")[1].split("-"))
    richieste.append((inizio, fine))
    return io.BytesIO(DATI[inizio:min(fine + 1, inizio + taglio)])


def test_via_proxy_e_intervallo():
    proxato = pb.via_proxy(URL)
    assert proxato.startswith("http://127.0.0.1:") and proxato.endswith("&r=1")
    assert urllib.parse.parse_qs(urllib.parse.urlsplit(proxato).query)["u"] == [URL]
    assert not pb.via_proxy(URL, ritmo=False).endswith("&r=1")
    for diretto in [None, "https://example.com/videoplayback?clen=5",
                    "https://x.googlevideo.com@altro.com/videoplayback?clen=5",
                    "https://manifest.googlevideo.com/api/manifest/hls_playlist/x.m3u8",
                    "https://rr1.googlevideo.com/videoplayback?itag=18"]:   # senza clen
        assert pb.via_proxy(diretto) == diretto
    assert pb._intervallo("bytes=100-", 1000) == (100, 999)
    assert pb._intervallo("bytes=100-199", 1000) == (100, 199)
    assert pb._intervallo("bytes=-10", 1000) == (990, 999)
    assert pb._intervallo(None, 1000) == (0, 999)
    assert pb._intervallo("bytes=1000-", 1000) is None


def test_blocchi_chiusi_e_ripresa(monkeypatch):
    """Richieste sempre chiuse e mai più grandi di BLOCCO; un taglio a metà riprende dal byte raggiunto."""
    richieste = []
    monkeypatch.setattr(pb, "BLOCCO", 300)
    monkeypatch.setattr(pb.urllib.request, "urlopen", functools.partial(_urlopen_finto, richieste, 120))
    out = io.BytesIO()
    pb._copia_a_blocchi(URL, (50, 999), out, "Lavf", 0)
    assert out.getvalue() == DATI[50:]
    assert all(fine - inizio < 300 for inizio, fine in richieste)
    # Tagli ogni 120 byte: si riparte dal byte raggiunto con un blocco nuovo e intero.
    assert richieste[:3] == [(50, 349), (170, 469), (290, 589)]


def test_ritmo(monkeypatch):
    """Raffica di RAFFICA_S secondi a piena velocità, poi RITMO x bitrate medio: calendario, non tetto istantaneo."""
    orologio, attese = [0.0], []
    monkeypatch.setattr(pb, "RAFFICA_S", 2)
    monkeypatch.setattr(pb, "_LETTURA", 100)
    monkeypatch.setattr(pb.urllib.request, "urlopen", functools.partial(_urlopen_finto, [], 10 ** 6))
    monkeypatch.setattr(pb.time, "monotonic", lambda: orologio[0])
    monkeypatch.setattr(pb.time, "sleep", lambda s: (attese.append(s), orologio.__setitem__(0, orologio[0] + s)))
    pb._copia_a_blocchi(URL, (0, 999), io.BytesIO(), "Lavf", 100.0)   # 100 B/s: 10 s di contenuto
    # 200 byte di raffica gratis, gli altri 800 a 2 x 100 B/s = 4 s: 0.5 s ogni lettura da 100.
    assert attese == [0.5] * 8
    assert orologio[0] == 4.0


def test_http_come_ffmpeg(monkeypatch):
    """Il proxy vero, via HTTP: 206 con Content-Range/Length del file intero (ffmpeg lo vede cercabile), 416 oltre la fine, 400 fuori da googlevideo."""
    monkeypatch.setattr(pb.urllib.request, "urlopen", functools.partial(_urlopen_finto, [], 10 ** 6))
    percorso = pb.via_proxy(URL, ritmo=False).split("127.0.0.1:")[1]
    porta, cammino = percorso.split("/", 1)
    risposte = []
    for rng, url in [("bytes=900-", "/" + cammino), ("bytes=1000-", "/" + cammino),
                     ("bytes=0-", "/?u=" + urllib.parse.quote("https://example.com/videoplayback?clen=5", safe=""))]:
        conn = http.client.HTTPConnection("127.0.0.1", int(porta), timeout=5)
        conn.request("GET", url, headers={"Range": rng})
        r = conn.getresponse()
        risposte.append((r.status, r.getheader("Content-Range"), r.read()))
        conn.close()
    assert risposte[0] == (206, "bytes 900-999/1000", DATI[900:])
    assert risposte[1][:2] == (416, "bytes */1000")
    assert risposte[2][0] == 400
