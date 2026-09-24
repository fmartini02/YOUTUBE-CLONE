"""
watch_progress.py — fin dove è stato visto ogni video della cronologia.

La posizione (secondi) sta nella stessa voce di history.json, accanto a
titolo e durata: non è un file a parte perché vive e muore con la voce —
togliere un video dalla cronologia, o svuotarla, deve dimenticare anche il
punto a cui era arrivato, senza un secondo file da tenere allineato.

Il player la manda spesso (ogni ~15s mentre il video scorre, più pausa e
uscita), quindi su disco non ci va ogni volta: vedi PROGRESS_SAVE_MIN_S in
auth/config.py e flush_progress, chiamata allo spegnimento del server.
"""
import time

from auth.config import PROGRESS_SAVE_MIN_S, RESUME_END_MARGIN_S, RESUME_MIN_S
from auth.history import _save_history

# Ultima scrittura su disco dovuta a un aggiornamento di posizione, e se da
# allora ce n'è uno rimasto solo in memoria. Stato del solo processo, non da
# persistere: per questo sta qui e non in AuthState.
_disco = {"at": 0.0, "sporco": False}


def _voce(state, video_id: str):
    return next((h for h in state.history if h.get("id") == video_id), None)


def update_progress(state, video_id: str, progress: dict) -> bool:
    """
    Aggiorna posizione (e durata, se nota) di un video già in cronologia.

    False se il video non c'è: la voce la crea POST /api/history all'apertura
    del video, e una posizione senza voce non avrebbe dove stare (né titolo né
    miniatura da mostrare). Non sposta la voce: l'ordine della cronologia è
    quello delle aperture, non degli aggiornamenti.

    `progress["final"]` (pausa, uscita dal video, app in background) scrive
    subito su disco; gli aggiornamenti periodici al massimo ogni
    PROGRESS_SAVE_MIN_S secondi.
    """
    voce = _voce(state, video_id)
    if voce is None:
        return False
    voce["position"] = round(max(0.0, float(progress["position"])), 1)
    if progress.get("duration"):
        voce["duration"] = progress["duration"]
    voce["progress_at"] = time.time()
    ora = time.monotonic()
    if progress.get("final") or ora - _disco["at"] >= PROGRESS_SAVE_MIN_S:
        _save_history(state)
        _disco.update(at=ora, sporco=False)
    else:
        _disco["sporco"] = True
    return True


def resume_point(state, video_id: str) -> dict:
    """
    Posizione salvata di un video e secondo da cui riaprirlo (`resume`).

    La decisione di dove riprendere sta qui, non nel player, perché dipende
    anche dalla preferenza "resume" (Impostazioni): così il player, che la
    chiede prima di aprire il flusso, non deve aspettare anche le preferenze.
    `resume` è 0 con la preferenza spenta, sotto RESUME_MIN_S, o negli ultimi
    RESUME_END_MARGIN_S secondi (video finito: si riparte dall'inizio).
    """
    voce = _voce(state, video_id) or {}
    pos, dur = voce.get("position") or 0, voce.get("duration") or 0
    attiva = state.prefs.get("resume", True)
    finito = dur and pos >= dur - RESUME_END_MARGIN_S
    resume = pos if attiva and pos >= RESUME_MIN_S and not finito else 0
    return {"position": pos, "duration": dur or None, "resume": resume}


def progress_map(state) -> dict:
    """{id: {"position", "duration"}} dei video con una posizione: le barrette rosse delle card."""
    return {
        h["id"]: {"position": h["position"], "duration": h.get("duration")}
        for h in state.history
        if h.get("id") and h.get("position")
    }


def flush_progress(state):
    """Porta su disco una posizione rimasta solo in memoria (allo spegnimento del server)."""
    if _disco["sporco"]:
        _save_history(state)
        _disco["sporco"] = False
