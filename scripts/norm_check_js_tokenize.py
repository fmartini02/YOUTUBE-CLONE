"""
norm_check_js_tokenize.py — bilanciamento parentesi/graffe e mappa
indice-di-carattere -> numero di riga, condivisi dal resto del checker JS.
Isolato da norm_check_js.py solo per restare sotto le 5 funzioni per file.
"""


def _fine_blocco(testo: str, apertura: int, ap_char: str, ch_char: str) -> int:
    """Indice del carattere di chiusura che bilancia `apertura` (che è ap_char)."""
    depth = 1
    j = apertura + 1
    n = len(testo)
    while j < n and depth:
        if testo[j] == ap_char:
            depth += 1
        elif testo[j] == ch_char:
            depth -= 1
        j += 1
    return j - 1 if depth == 0 else n - 1


def _mappa_riga(testo: str):
    """Ritorna una funzione indice-di-carattere -> numero di riga (1-based)."""
    prefissi = [0]
    for idx, ch in enumerate(testo):
        if ch == "\n":
            prefissi.append(idx + 1)

    def riga(idx):
        lo, hi = 0, len(prefissi) - 1
        while lo < hi:
            mid = (lo + hi + 1) // 2
            if prefissi[mid] <= idx:
                lo = mid
            else:
                hi = mid - 1
        return lo + 1
    return riga
