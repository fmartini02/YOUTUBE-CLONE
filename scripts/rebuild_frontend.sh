#!/usr/bin/env bash
# rebuild_frontend.sh — ricostruisce frontend/dist quando i sorgenti sono più
# recenti del build già presente. Il server FastAPI serve dist/ così com'è
# (vedi CLAUDE.md, "frontend/dist/ è versionato"), quindi dopo ogni modifica a
# frontend/src serve un `npm run build`; questo script lo automatizza.
#
# Uso:
#   - a mano:            scripts/rebuild_frontend.sh
#   - hook di Claude:    .claude/settings.json → Stop / SubagentStop
#
# È un no-op veloce (nessun output, nessun build) quando dist/ è già aggiornato
# o quando Node non è installato. Non fa MAI commit: `git add frontend/dist`
# resta un passo manuale, come da CLAUDE.md.
set -eu

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fe="$repo_root/frontend"
dist="$fe/dist"

# Niente Node = niente build. Non è un errore: si esce zitti.
if ! command -v npm >/dev/null 2>&1 || ! command -v node >/dev/null 2>&1; then
  echo '{"suppressOutput": true}'
  exit 0
fi

# mtime (epoch, con frazione) del file più recente sotto i percorsi dati,
# escluso node_modules. Vuoto se non c'è nulla.
newest() {
  find "$@" -type f -not -path '*/node_modules/*' -printf '%T@\n' 2>/dev/null \
    | sort -rn | head -n1
}

src_t="$(newest "$fe/src" "$fe/index.html" "$fe/vite.config.js" "$fe/package.json" "$fe/package-lock.json")"
dist_t="$(newest "$dist")"
[ -n "$src_t" ]  || { echo '{"suppressOutput": true}'; exit 0; }   # niente sorgenti: nulla da fare
[ -n "$dist_t" ] || dist_t=0

# dist già aggiornato (sorgenti non più recenti del build): esci senza far nulla.
if awk "BEGIN { exit !($src_t <= $dist_t) }"; then
  echo '{"suppressOutput": true}'
  exit 0
fi

cd "$fe"

# Dipendenze mancanti o lockfile/manifest più recenti di node_modules → install.
nm_t="$(newest node_modules 2>/dev/null || true)"
if [ ! -d node_modules ] || [ -z "$nm_t" ] || awk "BEGIN { exit !($nm_t < $(newest package.json package-lock.json)) }"; then
  npm ci --no-audit --no-fund >/tmp/ytproxy_fe_build.log 2>&1 \
    || npm install --no-audit --no-fund >>/tmp/ytproxy_fe_build.log 2>&1
fi

if npm run build >>/tmp/ytproxy_fe_build.log 2>&1; then
  touch "$dist"
  echo '{"systemMessage": "frontend/dist ricostruito (sorgenti modificati). Per committarlo: git add frontend/dist"}'
else
  echo '{"systemMessage": "Rebuild di frontend/dist FALLITO — log in /tmp/ytproxy_fe_build.log"}'
fi
exit 0
