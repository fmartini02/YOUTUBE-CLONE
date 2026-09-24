"""
adaptive_format_selector vs cast_format_selector, fatti girare dal vero
motore di selezione di yt-dlp (niente rete: `build_format_selector` lavora
sui dizionari che gli si danno) su un elenco di formati come quello che
YouTube offre oggi — AV1 e VP9 fino al 4K, H.264 fino al 1080p, Opus e AAC.

Il punto da non rompere: il Cast non riceve mai AV1 né Opus in MP4, che quasi
nessun Chromecast decodifica; solo il 4K del Cast passa al VP9 (+Opus, in WebM).
"""
import pytest

from auth.cookie_session import crea_ydl
from ytdlp.format_selectors import adaptive_format_selector, cast_format_selector

_VIDEO = [  # (format_id, altezza, vcodec, ext)
    ("136", 720, "avc1.4d401f", "mp4"), ("137", 1080, "avc1.640028", "mp4"),
    ("398", 720, "av01.0.05M.08", "mp4"), ("399", 1080, "av01.0.08M.08", "mp4"),
    ("401", 2160, "av01.0.12M.08", "mp4"), ("248", 1080, "vp9", "webm"),
    ("313", 2160, "vp9", "webm"),
]
_AUDIO = [("140", "mp4a.40.2", "m4a", 129), ("251", "opus", "webm", 140)]
FORMATI = (
    [dict(format_id=f, height=h, width=h * 16 // 9, vcodec=c, acodec="none", ext=e,
          url=f"https://finto/{f}", protocol="https", tbr=h * 3) for f, h, c, e in _VIDEO]
    + [dict(format_id=f, vcodec="none", acodec=c, ext=e, url=f"https://finto/{f}",
            protocol="https", abr=b, tbr=b) for f, c, e, b in _AUDIO]
    + [dict(format_id="18", height=360, width=640, vcodec="avc1.42001E", acodec="mp4a.40.2",
            ext="mp4", url="https://finto/18", protocol="https", tbr=500)]
)


def _scegli(selettore: str) -> str:
    """format_id scelto da yt-dlp, es. '401+251' (video+audio separati)."""
    with crea_ydl({"quiet": True}) as ydl:
        info = {"formats": [dict(f) for f in FORMATI]}
        ydl.sort_formats(info)          # dal peggiore al migliore, come fa l'estrattore
        scelta = ydl.build_format_selector(selettore)
        ctx = {"formats": info["formats"], "has_merged_format": True, "incomplete_formats": False}
        return next(iter(scelta(ctx)))["format_id"]


@pytest.mark.parametrize("selettore,atteso", [
    (adaptive_format_selector("best"), "401+251"),        # il meglio assoluto: AV1 4K + Opus
    (adaptive_format_selector("720"), "398+251"),
    (adaptive_format_selector("sconosciuta"), "401+251"),  # default 2160
    (cast_format_selector("720"), "136+140"),
    (cast_format_selector("2160"), "137+140"),             # senza hq: tetto H.264 1080
    (cast_format_selector("1080", True), "137+140"),       # hq conta solo oltre il 1080p
    (cast_format_selector("2160", True), "313+251"),       # Cast 4K: VP9 + Opus
])
def test_scelta_formato(selettore, atteso):
    assert _scegli(selettore) == atteso


@pytest.mark.parametrize("qualita", ["best", "2160", "1440", "1080", "720", "480", "360"])
def test_cast_mai_av1_ne_opus(qualita):
    """
    Per /api/download e il Cast normale: sempre H.264 + AAC, a qualunque qualità
    — due flussi separati o, sotto i 720p di questo elenco, il progressivo `18`.
    """
    per_id = {f["format_id"]: f for f in FORMATI}
    scelti = [per_id[i] for i in _scegli(cast_format_selector(qualita)).split("+")]
    assert all(f["vcodec"] == "none" or f["vcodec"].startswith("avc1") for f in scelti)
    assert all(f["acodec"] == "none" or f["acodec"].startswith("mp4a") for f in scelti)
    assert any(f["vcodec"] != "none" for f in scelti) and any(f["acodec"] != "none" for f in scelti)
