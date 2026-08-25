#!/usr/bin/env python3
"""
norm_check.py — verifica che il codice Python del server rispetti le regole
"stile 42" chieste per questo progetto:

  - non più di 5 funzioni per file (funzioni a livello di modulo + metodi di
    classe, sommati; le funzioni annidate/le closure NON contano a parte —
    fanno parte del corpo della funzione che le contiene)
  - non più di 25 righe di CODICE per funzione (si esclude il blocco
    docstring, le righe vuote e le righe che sono solo un commento: contare
    anche quelle avrebbe penalizzato la documentazione estesa che il progetto
    usa di proposito — vedi CLAUDE.md)
  - non più di 5 argomenti per funzione (self escluso)

Uso:
    python3 scripts/norm_check.py [percorsi...]   # default: server/ frontend/src/ electron/ scripts/
Esce con codice 1 se trova violazioni, elencandole; 0 se tutto conforme.

Il lato Python usa l'AST vero (preciso). Il lato JS/JSX (norm_check_js.py)
usa un tokenizer euristico — niente parser JS a disposizione: buono come
rete, non sostituisce la lettura. Vedi il docstring di quel modulo.
"""
import ast
import sys
from pathlib import Path

from norm_check_js import controlla_file_js
from norm_check_files import raccogli_file

MAX_FUNZIONI_PER_FILE = 5
MAX_RIGHE_PER_FUNZIONE = 25
MAX_ARGOMENTI = 5


def _righe_di_codice(source_lines: list, node) -> int:
    """Righe non vuote/non-commento del corpo, escluso il blocco docstring."""
    inizio_corpo = node.body
    if (inizio_corpo and isinstance(inizio_corpo[0], ast.Expr)
            and isinstance(getattr(inizio_corpo[0], "value", None), ast.Constant)
            and isinstance(inizio_corpo[0].value.value, str)):
        doc_end = inizio_corpo[0].end_lineno
    else:
        doc_end = node.lineno  # nessun docstring: non esclude nulla

    count = 0
    for lineno in range(node.lineno, node.end_lineno + 1):
        if lineno <= doc_end:
            continue
        testo = source_lines[lineno - 1].strip()
        if testo and not testo.startswith("#"):
            count += 1
    return count


def _n_argomenti(node) -> int:
    a = node.args
    n = len(a.args) + len(a.posonlyargs) + len(a.kwonlyargs)
    if a.vararg:
        n += 1
    if a.kwarg:
        n += 1
    if n and a.args and a.args[0].arg == "self":
        n -= 1
    return n


def _funzioni_dirette(tree) -> list:
    """Funzioni/metodi a livello di modulo o di classe (non le closure annidate)."""
    out = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            for m in node.body:
                if isinstance(m, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    out.append((f"{node.name}.{m.name}", m))
        elif isinstance(node, ast.Module):
            for m in node.body:
                if isinstance(m, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    out.append((m.name, m))
    return out


def controlla_file(path: Path) -> list:
    source = path.read_text()
    lines = source.splitlines()
    tree = ast.parse(source, filename=str(path))
    funzioni = _funzioni_dirette(tree)
    problemi = []

    if len(funzioni) > MAX_FUNZIONI_PER_FILE:
        nomi = ", ".join(n for n, _ in funzioni)
        problemi.append(f"{path}: {len(funzioni)} funzioni (max {MAX_FUNZIONI_PER_FILE}) -> {nomi}")

    for nome, node in funzioni:
        righe = _righe_di_codice(lines, node)
        if righe > MAX_RIGHE_PER_FUNZIONE:
            problemi.append(f"{path}:{node.lineno}: {nome} ha {righe} righe di codice (max {MAX_RIGHE_PER_FUNZIONE})")
        nargs = _n_argomenti(node)
        if nargs > MAX_ARGOMENTI:
            problemi.append(f"{path}:{node.lineno}: {nome} ha {nargs} argomenti (max {MAX_ARGOMENTI})")

    return problemi


def main():
    target_args = sys.argv[1:] or ["server", "frontend/src", "electron", "scripts"]
    root = Path(__file__).parent.parent
    file_python, file_js = raccogli_file(target_args, root)

    tutti_i_problemi = []
    for f in sorted(file_python):
        tutti_i_problemi.extend(controlla_file(f))
    for f in sorted(file_js):
        tutti_i_problemi.extend(controlla_file_js(f))

    if tutti_i_problemi:
        print(f"{len(tutti_i_problemi)} violazioni:\n")
        for p in tutti_i_problemi:
            print(f"  {p}")
        sys.exit(1)
    print(f"OK — {len(file_python)} file Python + {len(file_js)} file JS/JSX conformi "
          f"(JS: controllo euristico, vedi norm_check_js.py).")


if __name__ == "__main__":
    main()
