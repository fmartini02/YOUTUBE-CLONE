"""
sincronia.py — il criterio con cui i test controllano la sincronia
audio/video sul contenuto, non a orecchio.

Ogni pacchetto in uscita da ffmpeg (in copia) è un pacchetto della sorgente:
stessa dimensione, e tempo uguale a quello della sorgente più uno SCARTO.
`scarto()` trova quello scarto per una traccia, e la sincronia è che video e
audio abbiano lo stesso: se il muxer portasse una traccia a 0, la spostasse
(il +40ms dell'edit list) o ne "stirasse" il primo campione (CLAUDE.md,
"Sincronia audio/video sui salti"), gli scarti delle due tracce
differirebbero proprio di quella quantità — ed è la desincronia del labiale.
Sulla timeline sorgente lo scarto deve anche essere 0, perché il player usa
`currentTime` come posizione.

Lo scarto si cerca confrontando la SEQUENZA delle dimensioni, non un
pacchetto solo: le dimensioni audio si ripetono spesso (38 diverse su 500
per il sinusoide in Opus), una sequenza di 20 no. Se più di uno scarto
fosse compatibile la prova fallisce invece di sceglierne uno.
"""
import subprocess
from functools import lru_cache

from media_finti import pacchetti

FINESTRA_S = 10       # gli scarti visti in passato: 1.7s, 6s, 7s


def esegui(cmd: list, uscita, byte: int = 200_000) -> None:
    """
    Al posto di pipe:1 un file, fermato dopo `byte`: servono i primi
    pacchetti, non i 10 minuti interi. Non `-t`: con `-copyts` ffmpeg lo
    confronta coi tempi assoluti, e un salto oltre quel secondo usciva vuoto.
    """
    cmd = [*cmd[:-1], "-fs", str(byte), str(uscita)]
    subprocess.run([cmd[0], "-nostdin", "-y", *cmd[1:]], check=True, timeout=120)


@lru_cache(maxsize=None)
def _sorgente(percorso: str, flusso: str) -> tuple:
    """Tutti i pacchetti della sorgente e {tempo al millesimo: dimensione}; letti una volta sola."""
    tutti = pacchetti(percorso, flusso)
    return tutti, {round(pts, 3): dim for pts, dim, _ in tutti}


def dimensione_a(sorgente, flusso: str, tempo: float):
    """Dimensione del pacchetto della sorgente a `tempo` (±1ms di arrotondamento), None se non c'è."""
    per_tempo = _sorgente(str(sorgente), flusso)[1]
    for t in (tempo, tempo + 0.001, tempo - 0.001):
        if round(t, 3) in per_tempo:
            return per_tempo[round(t, 3)]
    return None


def scarto(uscita, sorgente, flusso: str, quanti: int = 20) -> float:
    """Di quanto i primi `quanti` pacchetti di `flusso` in uscita sono spostati rispetto alla sorgente."""
    usciti = pacchetti(uscita, flusso, quanti=quanti)
    assert len(usciti) == quanti, f"{flusso}: {len(usciti)} pacchetti in uscita invece di {quanti}"
    p0, d0, _ = usciti[0]
    candidati = {round(p0 - pts, 3) for pts, dim, _ in _sorgente(str(sorgente), flusso)[0]
                 if dim == d0 and abs(p0 - pts) <= FINESTRA_S}
    validi = [s for s in candidati
              if all(dimensione_a(sorgente, flusso, pts - s) == dim for pts, dim, _ in usciti)]
    assert len(validi) == 1, f"{flusso}: scarti compatibili con la sorgente: {sorted(validi)}"
    return validi[0]
