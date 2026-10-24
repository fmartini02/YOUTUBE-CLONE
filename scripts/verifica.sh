#!/usr/bin/env bash
# verifica.sh — tutto quello che deve essere verde prima di un push, in un
# comando solo. Lo lancia l'hook .githooks/pre-push; a mano va bene uguale.
#
# Uso:
#   scripts/verifica.sh           # offline: norm_check, build, pytest, Playwright (~1 min)
#   scripts/verifica.sh --rete    # in più le prove contro YouTube vero (lente, e un
#                                 # loro fallimento può essere YouTube che cambia)
#
# Si ferma al primo passo che fallisce. Il build del frontend si rifà sempre:
# i test e2e usano frontend/dist, e un dist/ vecchio darebbe un falso verde
# (o un falso rosso) sul codice che si sta provando. Che il dist/ committato
# fosse aggiornato lo controlla poi l'hook, guardando se il build l'ha cambiato.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo"
rete=0
[ "${1:-}" = "--rete" ] && rete=1
log="$(mktemp -t ytproxy-verifica.XXXXXX)"

passo() { printf '\n▶ %s\n' "$1"; }
fallito() { printf '\n✗ %s\n' "$1" >&2; exit 1; }

python3 -c 'import pytest' 2>/dev/null \
  || fallito "pytest non installato: python3 -m pip install -r server/requirements-dev.txt"
command -v npm >/dev/null || fallito "npm non trovato: serve Node per il build e i test del frontend"

passo "Regola di stile 5/25/5 (norm_check)"
python3 scripts/norm_check.py

passo "Build del frontend"
if [ ! -d frontend/node_modules/@playwright/test ]; then
  (cd frontend && npm ci --no-audit --no-fund >"$log" 2>&1) || fallito "npm ci fallito — log in $log"
fi
(cd frontend && npm run build >"$log" 2>&1) || fallito "npm run build fallito — log in $log"
echo "  ok"

passo "Test del server (pytest)"
python3 -m pytest -q

passo "Test del frontend (Playwright, server offline su :8098)"
(cd frontend && npm run test:e2e)

if [ "$rete" = 1 ]; then
  passo "Prove contro YouTube vero (pytest -m rete, Playwright @rete)"
  python3 -m pytest -q -m rete
  (cd frontend && npm run test:e2e:rete)
fi

printf '\n✓ Tutto verde.\n'
