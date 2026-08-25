"""
main.py — crea l'app FastAPI e la compone dai moduli di routers/.

Prima conteneva anche gli endpoint (55 funzioni): ora è solo cablaggio,
sotto le 5 funzioni per file quasi per definizione (vedi CLAUDE.md e
routers/__init__.py per la mappa dei moduli).
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import (auth_oauth, comment_replies, comments, cookies, feeds,
                      history, prefs, search, spa, status, streaming,
                      subscriptions, watch)
from routers.spa import HashedStaticFiles, frontend_dist
from security import ORIGINI_EXTRA, ORIGINI_LOCALI_RE, blocca_scritture_esterne
from server_config import SERVER_PORT
from startup import on_startup
from ytdlp_patch import applica_patch_collaborazioni

# Va applicata prima di qualsiasi estrazione: recupera l'id del canale nelle
# card dei video in collaborazione, che altrimenti restano senza logo e non
# cliccabili.
applica_patch_collaborazioni()

app = FastAPI(title="YTProxy")

# Guardia sulle scritture esterne (vedi security.py). Dichiarata PRIMA di
# CORSMiddleware: così il preflight OPTIONS lo gestisce CORSMiddleware e la
# guardia vede solo le richieste vere.
app.middleware("http")(blocca_scritture_esterne)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINI_EXTRA,
    allow_origin_regex=ORIGINI_LOCALI_RE,
    allow_methods=["*"],
    allow_headers=["*"],
)

for _router_module in (search, status, watch, streaming, comments, comment_replies,
                       auth_oauth, subscriptions, feeds, cookies, history, prefs, spa):
    app.include_router(_router_module.router)

app.on_event("startup")(on_startup)

# Serve React frontend — mount ultimo: è un catch-all su "/" e deve restare
# sotto le route API dichiarate sopra.
if frontend_dist.exists():
    app.mount("/", HashedStaticFiles(directory=str(frontend_dist), html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=SERVER_PORT, reload=True)
