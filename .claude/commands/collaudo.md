---
description: Lancia l'agente collaudo-api sul problema indicato, poi su DOCS/COLLAUDO.md
argument-hint: [descrizione del problema o della feature da verificare]
---

Invoca il subagent **collaudo-api** (Task tool, `subagent_type: "collaudo-api"`).

Passagli come contesto:

- **Cosa verificare per primo**: $ARGUMENTS
  Se qui non c'è nulla, ricava dal `git diff` corrente qual è il problema che la modifica intende risolvere e diglielo esplicitamente.
- Deve seguire le sue due regole nell'ordine: prima riprodurre e provare il caso concreto segnalato, poi passare in rassegna tutte le voci di `DOCS/COLLAUDO.md` con esito OK / KO / non verificabile.
- Server di collaudo su porta separata **8097**, solo su `127.0.0.1`, chiuso a fine lavoro.
- Non deve toccare `data/` né lanciare `yt-dlp` a mano con `data/cookies.txt`.

Quando l'agente ha finito, riporta qui la prima riga del suo resoconto (problema → risolto / non risolto / non verificabile) e il verdetto complessivo.
