"""
_build_ffmpeg_cmd: il comando atteso per ognuno dei rami documentati in
CLAUDE.md ("Riproduzione", "Sincronia audio/video sui salti"). Ogni opzione
controllata qui ha una storia di bug dietro: toglierne una per "semplificare"
deve far fallire un test.
"""
from routers.streaming import _build_ffmpeg_cmd

V, A = "https://finto/video", "https://finto/audio"


def test_partenza_da_zero_in_sola_copia():
    riga = " ".join(_build_ffmpeg_cmd(V, A))
    assert f"-i {V} -i {A} -map 0:v:0 -map 1:a:0 -c copy" in riga
    assert "-ss" not in riga and "-copyts" not in riga and "aac" not in riga
    assert riga.endswith("-movflags empty_moov+default_base_moof -frag_duration 1000000 -f mp4 pipe:1")


def test_salto_timeline_relativa():
    """Probe già fatto (keyframe 60.959): dts heuristic sul video, audio ricodificato in AAC."""
    riga = " ".join(_build_ffmpeg_cmd(V, A, seek=60.959, container="mp4", audio_aac=True))
    assert f"-ss 61.090 -itsoffset 0.131 -i {V} -ss 60.959 -i {A}" in riga
    assert "-c:v copy -c:a aac -b:a 160k" in riga
    assert "-copyts" not in riga and "frag_discont" not in riga


def test_salto_timeline_sorgente():
    """tempi=sorgente: tempi veri su ogni campione, niente probe né euristica né ricodifica."""
    riga = " ".join(_build_ffmpeg_cmd(V, A, seek=13.7, container="mp4_sorgente"))
    assert riga.startswith(_build_ffmpeg_cmd(V, A)[0] + " -loglevel error -copyts ")
    assert f"-ss 13.700 -i {V} -ss 13.700 -i {A}" in riga
    assert "-itsoffset" not in riga and "aac" not in riga and "-c copy" in riga
    assert "-avoid_negative_ts make_non_negative -use_editlist 0" in riga
    assert "-movflags empty_moov+default_base_moof+frag_discont" in riga


def test_ramo_webm_del_cast_4k():
    riga = " ".join(_build_ffmpeg_cmd(V, A, seek=30, container="webm"))
    assert f"-ss 30.000 -i {V} -ss 30.000 -i {A}" in riga
    assert riga.endswith("-c copy -live 1 -cluster_time_limit 1000 -f webm pipe:1")
    assert "movflags" not in riga and "-itsoffset" not in riga


def test_formato_progressivo_un_solo_input():
    riga = " ".join(_build_ffmpeg_cmd(V, None, seek=5, container="mp4"))
    assert f"-ss 5.000 -i {V} -c copy -movflags" in riga
    assert "-map" not in riga and "-itsoffset" not in riga
