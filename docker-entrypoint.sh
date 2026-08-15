#!/bin/sh
# Punto d'ingresso del container.
#
# start_server.sh aggiornava yt-dlp una volta al giorno prima di avviare —
# qui, non essendoci un processo che resta vivo tra un avvio e l'altro come
# sull'host, lo si fa ad ogni avvio del container. yt-dlp si rompe spesso
# dietro ai cambi di YouTube, quindi restare fermi alla versione dell'immagine
# è la causa più comune di "ha smesso di funzionare".
#
# Non bloccante: se manca la rete (il Pi si accende prima del router, o è
# offline) il server parte comunque con la versione che ha già.
set -e

if [ "$YTPROXY_SKIP_YTDLP_UPDATE" != "1" ]; then
  # --no-deps: yt-dlp nuovo che alza il vincolo su una dipendenza condivisa
  # (certifi, websockets, pyyaml...) non deve trascinarsi dietro un upgrade
  # dell'intero ambiente — l'immagine ha già tutto quello che serve.
  pip install --quiet --upgrade --no-deps yt-dlp \
    || echo "⚠️  aggiornamento yt-dlp fallito (offline?), continuo con la versione attuale"
fi

exec python3 -m uvicorn main:app --host 0.0.0.0 --port "${YTPROXY_PORT:-8090}"
