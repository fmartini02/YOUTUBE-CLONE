"""
Il comando di _build_ffmpeg_cmd eseguito davvero, su file locali sintetici
(media_finti.py), in VP9+Opus e in H.264+AAC coi B-frame: la sincronia
audio/video sui salti si controlla sul contenuto, con il criterio di
sincronia.py (stesso scarto dalla sorgente per video e audio).

I salti coprono i casi che in passato si sono rotti in modo diverso: da 0,
esattamente su un keyframe, un millesimo dopo, a metà gruppo, un millesimo
prima del keyframe successivo, a metà di un video lungo e a 3s dalla fine
(dove `-copypriorss 0` dava un flusso senza video).
"""
import pytest

from media_finti import KEYFRAME_OGNI, pacchetti
from routers.streaming import _build_ffmpeg_cmd, _keyframe_before
from sincronia import dimensione_a, esegui, scarto

SALTI = [0, 12.0, 12.001, 13.7, 13.999, 450.3, 597.0]


@pytest.mark.parametrize("salto", SALTI)
def test_timeline_sorgente_audio_e_video_allineati(coppia_finta, salto, tmp_path):
    """Player MSE (`tempi=sorgente`): stesso scarto per le due tracce, e 0 sui salti."""
    _, video, audio = coppia_finta
    uscita = tmp_path / "sorgente.mp4"
    esegui(_build_ffmpeg_cmd(str(video), str(audio), seek=salto, container="mp4_sorgente"), uscita)
    primo = pacchetti(uscita, "v:0", quanti=1)[0]
    assert primo[2].startswith("K")
    s_video, s_audio = scarto(uscita, video, "v:0"), scarto(uscita, audio, "a:0")
    assert abs(s_video - s_audio) <= 0.001, f"audio e video sfasati di {s_video - s_audio:+.3f}s"
    if salto == 0:
        # -avoid_negative_ts sposta tutto in blocco (pre-skip Opus, dts negativo dei B-frame)
        assert abs(s_video) < 0.2
    else:
        assert s_video == 0, "i tempi in uscita non sono quelli veri della sorgente"
        assert salto - KEYFRAME_OGNI <= primo[0] <= salto


@pytest.mark.parametrize("salto", [13.7, 450.3, 597.0])
def test_timeline_relativa_parte_da_zero_insieme(coppia_finta, salto, tmp_path, request):
    """
    Ripiego <video src> e Cast: col keyframe trovato dal probe vero, video e
    audio (ricodificato in AAC, quindi senza scarto misurabile) partono
    insieme da 0, e il video parte proprio da quel keyframe.
    """
    codec, video, audio = coppia_finta
    if codec == "h264":
        request.applymarker(pytest.mark.xfail(strict=True, reason=(
            "senza edit list il primo fotogramma H.264 esce a +2 fotogrammi (ritardo dei B-frame, "
            "0.133s su questi media) mentre l'audio parte da 0: video indietro su ripiego e Cast. "
            "Su un video YouTube vero il collaudo del 2026-09-24 ha misurato +16.8ms: da capire "
            "se la differenza è dei media finti o della misura. Se il test passa, togli questo xfail.")))
    keyframe = _keyframe_before(str(video), salto)
    assert salto - KEYFRAME_OGNI < keyframe <= salto + 0.001
    uscita = tmp_path / "relativo.mp4"
    esegui(_build_ffmpeg_cmd(str(video), str(audio), seek=keyframe, container="mp4", audio_aac=True), uscita)
    primo_video = pacchetti(uscita, "v:0", quanti=1)[0]
    primo_audio = pacchetti(uscita, "a:0", quanti=1)[0]
    assert dimensione_a(video, "v:0", keyframe) == primo_video[1]   # è proprio il keyframe chiesto
    assert primo_audio[0] < 0.05
    assert abs(primo_video[0] - primo_audio[0]) <= 0.02, \
        f"video {primo_video[0]:.3f}s, audio {primo_audio[0]:.3f}s"
