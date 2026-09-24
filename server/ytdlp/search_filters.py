"""
search_filters.py — filtri della ricerca -> URL dei risultati di YouTube.

`ytsearchN:` di yt-dlp non accetta filtri: chiede sempre e solo video
(`sp=EgIQAfABAQ==` fisso nell'estrattore). La pagina dei risultati di YouTube
invece li porta tutti nel parametro `sp`, che è un messaggio protobuf in
base64 — ed estraendo con yt-dlp quell'URL (`youtube:search_url`) i filtri
vengono rispettati, con le stesse continuazioni di `ytsearch`.

Struttura di `sp` (verificata sulle risposte reali, settembre 2026):

    campo 1 (varint)   ordinamento: 3 = visualizzazioni (0 = pertinenza)
    campo 2 (messaggio) filtri:
        1  data di caricamento: 1 ultima ora, 2 oggi, 3 settimana, 4 mese, 5 anno
        2  tipo: 1 video, 2 canale, 3 playlist
        3  durata: 1 meno di 4 minuti, 2 più di 20, 3 da 4 a 20

Manca di proposito l'ordinamento per data di caricamento (campo 1 = 2):
YouTube non lo rispetta più — `CAI=` restituisce le date fuori ordine,
e dal 2025 il suo pannello filtri offre solo «Pertinenza» e «Popolarità».
Per i video recenti c'è il filtro sulla data.

I valori sono in italiano perché finiscono nell'URL della SPA
(`/search?q=…&tipo=canale`), che si ricarica e si condivide.
"""
import base64
import urllib.parse
from dataclasses import dataclass
from typing import Optional

# Valore esposto -> numero nel protobuf di `sp`.
TIPI = {"video": 1, "canale": 2, "playlist": 3}
DURATE = {"breve": 1, "lunga": 2, "media": 3}
DATE = {"ora": 1, "oggi": 2, "settimana": 3, "mese": 4, "anno": 5}
ORDINI = {"visualizzazioni": 3}


@dataclass
class FiltriRicerca:
    """
    Parametri query di /api/search oltre a `q` e `page`, raggruppati per
    restare sotto i 5 argomenti (FastAPI li legge dal costruttore con
    `Depends()`). Ogni campo assente o con un valore sconosciuto vale
    "nessun filtro", non un errore: un link salvato con un valore che non
    esiste più deve comunque aprire una ricerca.
    """
    tipo: Optional[str] = None
    durata: Optional[str] = None
    data: Optional[str] = None
    ordina: Optional[str] = None


def normalizza_filtri(f: FiltriRicerca) -> dict:
    """
    Solo i filtri validi e applicabili, come dizionario (è anche ciò che
    la risposta rimanda al frontend in `filtri`, per dire cosa è stato
    applicato davvero).

    Durata e data riguardano i video: con tipo canale o playlist vengono
    scartate, come fa il pannello di YouTube che in quel caso le disattiva.
    """
    attivi = {
        "tipo": f.tipo if f.tipo in TIPI else None,
        "durata": f.durata if f.durata in DURATE else None,
        "data": f.data if f.data in DATE else None,
        "ordina": f.ordina if f.ordina in ORDINI else None,
    }
    if attivi["tipo"] in ("canale", "playlist"):
        attivi["durata"] = attivi["data"] = None
    return {k: v for k, v in attivi.items() if v}


def _campo_varint(numero: int, valore: int) -> bytes:
    """Un campo varint del protobuf. Numeri e valori qui stanno tutti sotto 16: un byte ciascuno."""
    return bytes([numero << 3, valore])


def codifica_sp(filtri: dict) -> Optional[str]:
    """Filtri normalizzati -> valore di `sp`, o None se non ce n'è nessuno."""
    interno = b""
    if "data" in filtri:
        interno += _campo_varint(1, DATE[filtri["data"]])
    if "tipo" in filtri:
        interno += _campo_varint(2, TIPI[filtri["tipo"]])
    if "durata" in filtri:
        interno += _campo_varint(3, DURATE[filtri["durata"]])
    sp = _campo_varint(1, ORDINI[filtri["ordina"]]) if "ordina" in filtri else b""
    if interno:
        sp += bytes([2 << 3 | 2, len(interno)]) + interno   # campo 2, messaggio annidato
    return base64.b64encode(sp).decode() if sp else None


def url_ricerca(q: str, filtri: dict) -> str:
    """URL della pagina dei risultati di YouTube per `q` con i filtri dati."""
    parametri = {"search_query": q}
    sp = codifica_sp(filtri)
    if sp:
        parametri["sp"] = sp
    return "https://www.youtube.com/results?" + urllib.parse.urlencode(parametri)
