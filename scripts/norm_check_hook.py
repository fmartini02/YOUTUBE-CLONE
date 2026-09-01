#!/usr/bin/env python3
"""
norm_check_hook.py — hook PostToolUse di Claude Code.

Dopo ogni Edit/Write/MultiEdit lancia `scripts/norm_check.py` sul solo file
appena toccato, così una violazione della regola "stile 42" (5 funzioni per
file / 25 righe per funzione / 5 argomenti — vedi CLAUDE.md) salta fuori
subito, non al commit o dalla rilettura del `revisore`.

Legge su stdin il JSON dell'hook, isola `tool_input.file_path`, e agisce solo
se è un `.py`/`.js`/`.jsx` sotto i percorsi che la norma copre
(`server/`, `frontend/src/`, `electron/`, `scripts/`). In ogni altro caso
esce 0 in silenzio.

Un file che contiene il marcatore `norm-check: ignora-file` in un commento è
saltato: sono le eccezioni dichiarate (oggi solo `VideoPlayer`, vedi CLAUDE.md),
dove la correttezza impone di stare fuori norma. Il controllo sull'intero repo
(`python3 scripts/norm_check.py` senza argomenti) continua a elencarle: là è un
audit visibile, qui darebbe un falso allarme ad ogni modifica.

Se `norm_check.py` trova violazioni, le scrive su stderr ed esce 2: Claude
Code rimette quel testo nel contesto del modello. NON annulla la modifica
(è già su disco) e non blocca nulla — è un promemoria, come il rebuild di
`dist/` fatto dagli hook Stop/SubagentStop.
"""
import json
import subprocess
import sys
from pathlib import Path

COPERTI = ("server/", "frontend/src/", "electron/", "scripts/")


def _file_da_controllare(data: dict) -> Path | None:
    """Il percorso dentro l'input dell'hook, se è un file coperto dalla norma."""
    fp = (data.get("tool_input") or {}).get("file_path")
    if not fp:
        return None
    p = Path(fp)
    if p.suffix not in (".py", ".js", ".jsx") or not p.exists():
        return None
    root = Path(__file__).resolve().parent.parent
    try:
        rel = p.resolve().relative_to(root).as_posix()
    except ValueError:
        return None
    if not rel.startswith(COPERTI):
        return None
    if "norm-check: ignora-file" in p.read_text(errors="ignore"):
        return None
    return p


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0
    p = _file_da_controllare(data)
    if p is None:
        return 0
    root = Path(__file__).resolve().parent.parent
    res = subprocess.run(
        [sys.executable, str(root / "scripts" / "norm_check.py"), str(p)],
        capture_output=True, text=True,
    )
    if res.returncode != 0:
        sys.stderr.write(
            f"norm_check (stile 42): violazioni in {p.name}, da sistemare "
            f"prima del commit —\n{res.stdout}{res.stderr}"
        )
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
