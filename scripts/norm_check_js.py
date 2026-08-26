"""
norm_check_js.py — controllo euristico delle regole stile-42 per JS/JSX.

A differenza del lato Python (AST vero, norm_check.py), qui non c'è un parser
JS a disposizione: si usa un tokenizer minimo che toglie stringhe/commenti
tenendo l'allineamento delle righe (norm_check_js_strip.py), poi si cercano
le dichiarazioni di funzione **a colonna 0** (in un file formattato con
Prettier — 2 spazi, niente indentazione sulle dichiarazioni top-level — è un
proxy affidabile per "livello di modulo", ed evita di dover tracciare la
profondità delle graffe: un parametro destrutturato `({ a, b, c })`
introduce delle graffe "a livello 0" che altrimenti si confondono con
l'apertura del corpo della funzione).

Non è perfetto: un caso limite scritto in modo insolito può sfuggire o essere
contato male. Va usato come rete, non come sostituto della lettura — vedi
CLAUDE.md.
"""
import re

from norm_check_js_strip import _spoglia
from norm_check_js_tokenize import _fine_blocco, _mappa_riga

MAX_FUNZIONI_PER_FILE = 5
MAX_RIGHE_PER_FUNZIONE = 25
MAX_ARGOMENTI = 5

_DICHIARAZIONE_FUNCTION_RE = re.compile(
    r"^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*(\w+)\s*\(", re.MULTILINE)
_DICHIARAZIONE_ARROW_RE = re.compile(
    r"^(?:export\s+)?(?:default\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\(", re.MULTILINE)


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


def _trova_funzioni(spogliato: str, riga_di) -> list:
    """Dichiarazioni `function` e arrow a colonna 0, con righe e argomenti."""
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
    return funzioni


def controlla_file_js(path) -> list:
    source = path.read_text()
    spogliato = _spoglia(source)
    righe_originali = source.splitlines()
    riga_di = _mappa_riga(spogliato)
    funzioni = _trova_funzioni(spogliato, riga_di)
    problemi = []

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
