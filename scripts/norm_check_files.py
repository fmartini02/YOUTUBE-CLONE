"""
norm_check_files.py — scoperta dei file da controllare, isolata da
norm_check.py solo per restare sotto le 5 funzioni per file previste dalla
norma che lo script stesso applica.
"""
from pathlib import Path

ESCLUSI = {"node_modules", "android", "dist", "__pycache__"}


def _da_saltare(path: Path) -> bool:
    return any(parte in ESCLUSI for parte in path.parts)


def raccogli_file(target_args: list, root: Path) -> tuple:
    """Divide i file trovati sotto `target_args` in (python, js/jsx)."""
    file_python, file_js = [], []
    for arg in target_args:
        p = root / arg
        candidati = p.rglob("*") if p.is_dir() else [p]
        for f in candidati:
            if _da_saltare(f):
                continue
            if f.suffix == ".py":
                file_python.append(f)
            elif f.suffix in (".js", ".jsx"):
                file_js.append(f)
    return file_python, file_js
