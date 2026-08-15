# YTProxy — immagine del server.
#
# Il frontend NON si builda qui dentro: frontend/dist è versionato (vedi
# CLAUDE.md) e lo si copia così com'è. Chi tocca il frontend continua a fare
# `npm run build` + commit come prima; questa immagine si limita a impacchettare
# quel risultato insieme al server Python.
FROM python:3.12-slim

# ffmpeg: usato da /api/mux e /api/download per unire audio+video al volo
# (vedi CLAUDE.md, sezione "Riproduzione"). curl: solo per l'healthcheck.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Le dipendenze Python in un layer separato dal codice: cambiano raramente,
# così un rebuild dopo una modifica al codice non le reinstalla ogni volta.
COPY server/requirements.txt server/requirements.txt
RUN pip install --no-cache-dir -r server/requirements.txt

COPY server/ server/
COPY frontend/dist/ frontend/dist/

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# DATA_DIR (auth.py) fa mkdir(exist_ok=True) senza parents=True: la cartella
# deve esistere già a un solo livello, perché il volume ci si monti sopra.
RUN mkdir -p /data
ENV YTPROXY_DATA=/data
ENV YTPROXY_PORT=8090

WORKDIR /app/server
EXPOSE 8090

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8090/api/health || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
