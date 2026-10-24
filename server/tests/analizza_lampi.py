"""
analizza_lampi.py — di quanto l'audio è spostato rispetto al video in un
file che contiene la coppia "lampo" di media_finti.py (lampi bianchi nel
video, bip nello stesso istante nell'audio).

Lo usa frontend/e2e/sincronia.spec.js sulla registrazione del <video> fatta
nel browser (`captureStream` + `MediaRecorder`): è il labiale misurato su
quello che il player mostra e suona davvero, dopo MSE, riaperture e salti.
Si può lanciare anche a mano su qualunque file:

    python3 server/tests/analizza_lampi.py registrazione.webm
    → {"scarto": 0.153, "accoppiati": 7, "lampi": 7, "bip": 7}

`scarto` > 0 vuol dire audio in ritardo sul video. Non si cerca il bip più
vicino a ogni lampo: si prova ogni scarto fra ±FINESTRA_S e si tiene quello
che accoppia più lampi. Con gli istanti irregolari della coppia "lampo" il
picco è uno solo, e così anche uno scarto di secondi (i vecchi bug: 1.7s,
6s, 7s) si misura invece di scambiarlo per un altro evento.
"""
import json
import re
import subprocess
import sys

FINESTRA_S = 10
TOLLERANZA_S = 0.06       # due fotogrammi a 30 fps


def lampi(percorso: str) -> list:
    """
    Istanti (s) in cui il video passa da nero a bianco. Decodifica `ffmpeg`
    e non `ffprobe -f lavfi movie=`: sul VP9 dei media finti quella sorgente
    vedeva un lampo solo, a t=0, su 600s (provato).
    """
    err = subprocess.run(
        ["ffmpeg", "-nostdin", "-v", "info", "-i", percorso, "-map", "0:v:0",
         "-vf", "signalstats,metadata=print:key=lavfi.signalstats.YAVG", "-f", "null", "-"],
        capture_output=True, text=True, check=True, timeout=120).stderr
    coppie = re.findall(r"pts_time:([\d.]+).*?\n.*?YAVG=([\d.]+)", err)
    istanti, prima = [], True        # un lampo già acceso al primo fotogramma non ha un inizio misurabile
    for tempo, luminosita in coppie:
        acceso = float(luminosita) > 128
        if acceso and not prima:
            istanti.append(float(tempo))
        prima = acceso
    return istanti


def bip(percorso: str) -> list:
    """Istanti (s) in cui l'audio esce dal silenzio."""
    err = subprocess.run(
        ["ffmpeg", "-nostdin", "-v", "info", "-i", percorso, "-map", "0:a:0",
         "-af", "silencedetect=noise=-30dB:d=0.05", "-f", "null", "-"],
        capture_output=True, text=True, check=True, timeout=120).stderr
    # il primo silence_end può essere l'inizio del file a metà di un bip: lo
    # scarta l'accoppiamento, che conta solo i lampi con un bip vicino
    return [float(t) for t in re.findall(r"silence_end: ([\d.]+)", err)]


def scarto(istanti_lampi: list, istanti_bip: list) -> dict:
    """Lo scarto (bip − lampo) che accoppia più lampi, affinato sulla mediana delle coppie."""
    migliore = (0, 0.0)
    for passo in range(-FINESTRA_S * 200, FINESTRA_S * 200 + 1):
        s = passo / 200
        n = sum(any(abs(b - (l + s)) <= TOLLERANZA_S for b in istanti_bip) for l in istanti_lampi)
        if n > migliore[0]:
            migliore = (n, s)
    coppie = sorted(b - l for l in istanti_lampi for b in istanti_bip
                    if abs(b - (l + migliore[1])) <= TOLLERANZA_S)
    valore = coppie[len(coppie) // 2] if coppie else None
    return {"scarto": None if valore is None else round(valore, 3), "accoppiati": migliore[0],
            "lampi": len(istanti_lampi), "bip": len(istanti_bip)}


if __name__ == "__main__":
    print(json.dumps(scarto(lampi(sys.argv[1]), bip(sys.argv[1]))))
