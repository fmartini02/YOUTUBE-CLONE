"""
codec_strings.py — la stringa di codec (RFC 6381) da dichiarare al player MSE
nell'header `X-Mux-Codecs` di /api/mux.

yt-dlp la dà già completa per AV1 (`av01.0.09M.08`) e H.264 (`avc1.64002a`),
ma per il VP9 dei flussi DASH scrive soltanto `vp9` (o `vp9.2` per l'HDR a 10
bit). Dentro un MP4 Chrome quel nome nudo lo rifiuta — verificato:
`MediaSource.isTypeSupported('video/mp4; codecs="vp9,opus"')` è `false`,
con `vp09.00.41.08` è `true` — e il player, senza `SourceBuffer`, ripiegava
in silenzio su `<video src>` per ogni video servito in VP9. Qui si ricostruisce
la forma completa `vp09.<profilo>.<livello>.<bit>` dai dati del formato.
"""

# Livelli VP9 (specifica, allegato A): (livello, max campioni di luma per
# fotogramma, max campioni di luma al secondo). Il livello dichiarato è il più
# basso che contiene sia la dimensione sia la frequenza del flusso: gli stessi
# valori che YouTube scrive nelle sue varianti HLS (720p60 → 40, 1080p60 → 41,
# 1440p60 → 50, 2160p60 → 51).
_LIVELLI_VP9 = (
    (10, 36_864, 829_440), (11, 73_728, 2_764_800), (20, 122_880, 4_608_000),
    (21, 245_760, 9_216_000), (30, 552_960, 20_736_000), (31, 983_040, 36_864_000),
    (40, 2_228_224, 83_558_400), (41, 2_228_224, 160_432_128),
    (50, 8_912_896, 311_951_360), (51, 8_912_896, 588_251_136),
    (52, 8_912_896, 1_176_502_272), (60, 35_651_584, 1_176_502_272),
    (61, 35_651_584, 2_353_004_544), (62, 35_651_584, 4_706_009_088),
)


def _livello_vp9(width: int, height: int, fps: float) -> int:
    """Il livello VP9 più basso che regge `width`×`height` a `fps`."""
    campioni = width * height
    for livello, per_frame, al_secondo in _LIVELLI_VP9:
        if campioni <= per_frame and campioni * fps <= al_secondo:
            return livello
    return _LIVELLI_VP9[-1][0]


def codec_mse(fmt: dict) -> str:
    """
    `vcodec` del formato, pronto per `MediaSource.isTypeSupported`. Solo il VP9
    nudo (`vp9`, `vp9.2`) viene ricostruito; ogni altra stringa passa intatta.
    Senza dimensioni o fps si assume il caso peggiore sensato (4K a 60 fps):
    Chrome controlla che il livello sia valido, non che corrisponda al flusso.
    """
    vcodec = fmt.get("vcodec") or ""
    if vcodec not in ("vp9", "vp9.2"):
        return vcodec
    profilo, bit = ("02", "10") if vcodec == "vp9.2" else ("00", "08")
    livello = _livello_vp9(fmt.get("width") or 3840, fmt.get("height") or 2160, fmt.get("fps") or 60)
    return f"vp09.{profilo}.{livello:02d}.{bit}"
