"""
Il comando di _build_ffmpeg_cmd eseguito davvero, su file locali sintetici
(media_finti.py): la sincronia audio/video sui salti si controlla sul
contenuto, non a orecchio.

Il criterio è quello del collaudo manuale ("pacchetti accoppiati alla
sorgente"): sulla timeline sorgente ogni pacchetto in uscita deve avere lo
stesso tempo E la stessa dimensione del pacchetto della sorgente a quel
tempo. Se il muxer riportasse una traccia a 0, o la spostasse (il +40ms
dell'edit list, lo "stiramento" del primo campione), i tempi non
combacerebbero più — ed è esattamente la desincronia del labiale.
"""
import subprocess

from media_finti import KEYFRAME_OGNI, pacchetti
from routers.streaming import _build_ffmpeg_cmd


def _esegui(cmd: list, uscita) -> None:
    """Al posto di pipe:1 un file, e solo 20s: servono i primi pacchetti, non i 10 minuti interi."""
    cmd[-1:] = ["-t", "20", str(uscita)]
    subprocess.run([cmd[0], "-nostdin", "-y", *cmd[1:]], check=True, timeout=120)


def _accoppiati(uscita, sorgente, flusso: str) -> None:
    """I primi pacchetti in uscita esistono nella sorgente con lo stesso tempo e la stessa dimensione."""
    per_tempo = {round(pts, 3): dim for pts, dim, _ in pacchetti(sorgente, flusso)}
    for pts, dim, _ in pacchetti(uscita, flusso, quanti=20):
        assert per_tempo.get(round(pts, 3)) == dim, f"{flusso} a {pts:.3f}s non combacia con la sorgente"


def test_timeline_sorgente_tempi_veri(media_finti, tmp_path):
    video, audio = media_finti
    salto = 13.7
    uscita = tmp_path / "sorgente.mp4"
    _esegui(_build_ffmpeg_cmd(str(video), str(audio), seek=salto, container="mp4_sorgente"), uscita)
    primo_video = pacchetti(uscita, "v:0", quanti=1)[0]
    assert primo_video[2].startswith("K")
    # il keyframe <= salto, col suo tempo vero: non riportato a 0
    assert salto - KEYFRAME_OGNI <= primo_video[0] <= salto
    assert 0 < pacchetti(uscita, "a:0", quanti=1)[0][0] <= salto
    _accoppiati(uscita, video, "v:0")
    _accoppiati(uscita, audio, "a:0")


def test_timeline_relativa_parte_da_zero_insieme(media_finti, tmp_path):
    """Ripiego/Cast: seek = keyframe del probe, video e audio (AAC) partono insieme da 0."""
    video, audio = media_finti
    keyframe = 12.0
    uscita = tmp_path / "relativo.mp4"
    _esegui(_build_ffmpeg_cmd(str(video), str(audio), seek=keyframe, container="mp4", audio_aac=True), uscita)
    primo_video = pacchetti(uscita, "v:0", quanti=1)[0]
    primo_audio = pacchetti(uscita, "a:0", quanti=1)[0]
    assert primo_video[0] < 0.05 and primo_audio[0] < 0.05
    sorgente = {round(pts, 3): dim for pts, dim, _ in pacchetti(video, "v:0")}
    assert sorgente[keyframe] == primo_video[1]        # è proprio il keyframe chiesto
