"""
codec_mse: il `vp9` nudo di yt-dlp diventa `vp09.PP.LL.DD`, l'unica forma che
Chrome accetta dentro un MP4 (`isTypeSupported('video/mp4; codecs="vp9"')` è
false). I livelli attesi sono quelli che YouTube stesso dichiara nelle sue
varianti HLS dello stesso video (formati 612/617/623/628/605/603).
"""
import pytest

from ytdlp.codec_strings import codec_mse


@pytest.mark.parametrize("w,h,fps,atteso", [
    (1280, 720, 60, "vp09.00.40.08"),
    (1920, 1080, 60, "vp09.00.41.08"),
    (2560, 1440, 60, "vp09.00.50.08"),
    (3840, 2160, 60, "vp09.00.51.08"),
    (640, 360, 30, "vp09.00.21.08"),
    (256, 144, 30, "vp09.00.11.08"),
])
def test_livello_come_youtube(w, h, fps, atteso):
    assert codec_mse({"vcodec": "vp9", "width": w, "height": h, "fps": fps}) == atteso


def test_hdr_e_dati_mancanti():
    """VP9.2 (HDR) è profilo 2 a 10 bit; senza dimensioni si dichiara il livello del 4K60."""
    assert codec_mse({"vcodec": "vp9.2", "width": 1920, "height": 1080, "fps": 60}) == "vp09.02.41.10"
    assert codec_mse({"vcodec": "vp9"}) == "vp09.00.51.08"


@pytest.mark.parametrize("vcodec", ["av01.0.09M.08", "avc1.64002a", "vp09.00.41.08", ""])
def test_altri_codec_intatti(vcodec):
    assert codec_mse({"vcodec": vcodec, "width": 1920, "height": 1080, "fps": 60}) == vcodec
