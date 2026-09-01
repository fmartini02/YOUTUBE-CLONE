---
description: Aggiunge una pagina SPA nuova con le tre modifiche coerenti (routing frontend, rendering, route server)
argument-hint: <NomePagina> [/percorso-url]
---

Aggiungi al frontend la pagina **$1** (URL: `${2:-da decidere}`). React 18 + Vite, routing a mano sulla History API, nessun router.

Aggiungere una pagina richiede **tre modifiche coerenti** — se ne manca una, aprire l'URL diretto o ricaricare dà 404:

1. **`frontend/src/App/routing.js`** — `pageToUrl` e `urlToPage`: la corrispondenza pagina ↔ URL nei due sensi.
2. **`frontend/src/App/AppRoutes.jsx`** — il rendering condizionale del componente nuovo.
3. **`server/routers/spa.py`** — la route corrispondente in `spa_routes()`, così il server serve `index.html` su quell'URL.

Passi operativi:

- Guarda una pagina esistente semplice sotto `frontend/src/pages/` come modello (struttura, import, stile).
- Crea `frontend/src/pages/$1/index.jsx` (pacchetto, non file singolo, se prevedi più di 5 funzioni/componenti — regola stile 42 in CLAUDE.md).
- Applica le tre modifiche sopra.
- `npm run build` in `frontend/` e committa `frontend/dist/` insieme ai sorgenti.
- Aggiungi la voce in `DOCS/COLLAUDO.md` con la sua definizione di "funzionante".
- Testa: `curl -sI localhost:8090<percorso>` deve dare 200 e servire l'HTML della SPA.

$ARGUMENTS
