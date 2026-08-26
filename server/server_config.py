"""
server_config.py — porta del server.

Ripetuta in più punti che devono restare allineati: qui, il proxy in
frontend/vite.config.js, electron/main.js, scripts/start_server.sh/.bat,
Dockerfile (EXPOSE) e docker-compose.yml (ports).
"""
import os

SERVER_PORT = int(os.environ.get("YTPROXY_PORT", 8090))
