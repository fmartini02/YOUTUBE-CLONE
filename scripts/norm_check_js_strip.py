"""
norm_check_js_strip.py — toglie stringhe/commenti/template literal da una
sorgente JS mantenendo l'allineamento delle righe (per contare le righe di
codice senza confondersi con contenuto testuale). Isolato da norm_check_js.py
solo per restare sotto le 5 funzioni per file.
"""


def _salta_commento_blocco(source: str, i: int, n: int) -> tuple:
    """Ritorna (nuovo indice, testo sostitutivo) per un `/* ... */`."""
    j = source.find("*/", i + 2)
    j = n if j == -1 else j + 2
    testo = "".join(" " if ch != "\n" else "\n" for ch in source[i:j])
    return j, testo


def _consuma_stringa(source: str, i: int, n: int, c: str) -> tuple:
    """Ritorna (nuovo indice, testo sostitutivo) per la stringa che apre in `c`."""
    j = i + 1
    while j < n and source[j] != c:
        if source[j] == "\\":
            j += 1
        j += 1
    j = min(j + 1, n)
    testo = "".join(" " if ch != "\n" else "\n" for ch in source[i:j])
    return j, testo


def _spoglia(source: str) -> str:
    """Sostituisce stringhe/commenti/template literal con spazi, righe invariate."""
    out = []
    i, n = 0, len(source)
    while i < n:
        c = source[i]
        # Uno slash preceduto da un backslash non apre mai un commento: è la
        # fine di un letterale regex tipo /^https?:\/\//, dove lo slash
        # "escaped" seguito dallo slash di chiusura sembra un "//" ma non lo
        # è. Senza questo controllo il resto della riga (e la graffa di
        # chiusura JSX che spesso la segue) sparisce, sballando il conteggio
        # righe di ogni funzione a valle.
        precedente_backslash = i > 0 and source[i - 1] == "\\"
        if c == "/" and i + 1 < n and source[i + 1] == "/" and not precedente_backslash:
            j = source.find("\n", i)
            j = n if j == -1 else j
            out.append(" " * (j - i))
            i = j
        elif c == "/" and i + 1 < n and source[i + 1] == "*" and not precedente_backslash:
            i, testo = _salta_commento_blocco(source, i, n)
            out.append(testo)
        elif c == "'" and i > 0 and (source[i - 1].isalnum() or source[i - 1] == "_"):
            # Apostrofo di contrazione dentro testo JSX ("un'altra", "l'utente",
            # "it's"), non apertura di stringa: preceduto da lettera/cifra senza
            # spazio, cosa che una vera stringa JS in pratica non fa mai. Senza
            # questo il tokenizer partiva a cercare la ' di chiusura e ingoiava
            # il resto del file, sballando ogni conteggio a valle.
            out.append(c)
            i += 1
        elif c in "\"'`":
            i, testo = _consuma_stringa(source, i, n, c)
            out.append(testo)
        else:
            out.append(c)
            i += 1
    return "".join(out)
