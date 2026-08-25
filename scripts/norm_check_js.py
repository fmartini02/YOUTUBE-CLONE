"""
norm_check_js.py — controllo euristico delle regole stile-42 per JS/JSX.

A differenza del lato Python (AST vero, norm_check.py), qui non c'è un parser
JS a disposizione: si usa un tokenizer minimo che toglie stringhe/commenti
tenendo l'allineamento delle righe, poi si cercano le dichiarazioni di
funzione **a colonna 0** (in un file formattato con Prettier — 2 spazi,
niente indentazione sulle dichiarazioni top-level — è un proxy affidabile
per "livello di modulo", ed evita di dover tracciare la profondità delle
graffe: un parametro destrutturato `({ a, b, c })` introduce delle graffe
"a livello 0" che altrimenti si confondono con l'apertura del corpo della
funzione).

Non è perfetto: un caso limite scritto in modo insolito può sfuggire o essere
contato male. Va usato come rete, non come sostituto della lettura — vedi
CLAUDE.md.
"""
import re

MAX_FUNZIONI_PER_FILE = 5
MAX_RIGHE_PER_FUNZIONE = 25
MAX_ARGOMENTI = 5

_DICHIARAZIONE_FUNCTION_RE = re.compile(
    r"^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*(\w+)\s*\(", re.MULTILINE)
_DICHIARAZIONE_ARROW_RE = re.compile(
    r"^(?:export\s+)?(?:default\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\(", re.MULTILINE)


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
            j = source.find("*/", i + 2)
            j = n if j == -1 else j + 2
            out.append("".join(" " if ch != "\n" else "\n" for ch in source[i:j]))
            i = j
        elif c == "'" and i > 0 and (source[i - 1].isalnum() or source[i - 1] == "_"):
            # Apostrofo di contrazione dentro testo JSX ("un'altra", "l'utente",
            # "it's"), non apertura di stringa: preceduto da lettera/cifra senza
            # spazio, cosa che una vera stringa JS in pratica non fa mai. Senza
            # questo il tokenizer partiva a cercare la ' di chiusura e ingoiava
            # il resto del file, sballando ogni conteggio a valle.
            out.append(c)
            i += 1
        elif c in "\"'`":
            j = i + 1
            while j < n and source[j] != c:
                if source[j] == "\\":
                    j += 1
                j += 1
            j = min(j + 1, n)
            out.append("".join(" " if ch != "\n" else "\n" for ch in source[i:j]))
            i = j
        else:
            out.append(c)
            i += 1
    return "".join(out)


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


def _conta_argomenti(testo: str, apertura_parentesi: int, fine_parentesi: int) -> int:
    """Argomenti fra `(` e la sua `)` (indici già noti), sui top-level comma.

    Una graffa/parentesi/quadra dentro (destrutturazione, default) alza la
    profondità: le sue virgole interne non separano argomenti diversi, quindi
    `({ a, b, c })` conta 1 argomento, non 3.
    """
    dentro = testo[apertura_parentesi + 1:fine_parentesi].strip()
    if not dentro:
        return 0
    depth, n_arg = 0, 1
    for ch in dentro:
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1
        elif ch == "," and depth == 0:
            n_arg += 1
    return n_arg


def _fine_corpo(testo: str, dopo_parentesi: int):
    """
    Estensione del corpo dopo la `)` dei parametri: `{...}` per un corpo a
    blocco, `(...)` per un return implicito fra parentesi (JSX), altrimenti
    si assume corpo su una riga sola (espressione breve).
    """
    m = re.match(r"\s*=>\s*", testo[dopo_parentesi:])
    pos = dopo_parentesi + (m.end() if m else 0)
    # Salta spazi/a-capo fino al primo carattere non bianco.
    while pos < len(testo) and testo[pos].isspace():
        pos += 1
    if pos < len(testo) and testo[pos] == "{":
        return _fine_blocco(testo, pos, "{", "}")
    if pos < len(testo) and testo[pos] == "(":
        return _fine_blocco(testo, pos, "(", ")")
    return dopo_parentesi  # espressione breve: la riga della firma basta


def _righe_di_codice(righe_originali: list, inizio: int, fine: int) -> int:
    count = 0
    for lineno in range(inizio, min(fine, len(righe_originali)) + 1):
        t = righe_originali[lineno - 1].strip()
        if t and not t.startswith("//") and not t.startswith("*") and t != "/**":
            count += 1
    return count


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


def controlla_file_js(path) -> list:
    source = path.read_text()
    spogliato = _spoglia(source)
    righe_originali = source.splitlines()
    riga_di = _mappa_riga(spogliato)
    problemi = []

    funzioni = []
    for regex in (_DICHIARAZIONE_FUNCTION_RE, _DICHIARAZIONE_ARROW_RE):
        for m in regex.finditer(spogliato):
            nome = m.group(1)
            apertura = m.end() - 1  # indice del '(' con cui il match finisce
            fine_par = _fine_blocco(spogliato, apertura, "(", ")")
            nargs = _conta_argomenti(spogliato, apertura, fine_par)
            fine_corpo = _fine_corpo(spogliato, fine_par + 1)
            r_inizio, r_fine = riga_di(m.start()), riga_di(fine_corpo)
            funzioni.append((nome, r_inizio, r_fine, nargs))
    funzioni.sort(key=lambda f: f[1])

    if len(funzioni) > MAX_FUNZIONI_PER_FILE:
        nomi = ", ".join(f[0] for f in funzioni)
        problemi.append(f"{path}: {len(funzioni)} funzioni top-level (max {MAX_FUNZIONI_PER_FILE}) -> {nomi}")

    for nome, r_inizio, r_fine, nargs in funzioni:
        righe = _righe_di_codice(righe_originali, r_inizio, r_fine)
        if righe > MAX_RIGHE_PER_FUNZIONE:
            problemi.append(f"{path}:{r_inizio}: {nome} ha ~{righe} righe di codice (max {MAX_RIGHE_PER_FUNZIONE})")
        if nargs > MAX_ARGOMENTI:
            problemi.append(f"{path}:{r_inizio}: {nome} ha {nargs} argomenti (max {MAX_ARGOMENTI})")

    return problemi
