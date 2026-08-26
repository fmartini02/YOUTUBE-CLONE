"""status.py — salute del server e indirizzo LAN (per il Cast)."""
import socket

from fastapi import APIRouter

from core.config import SERVER_PORT

router = APIRouter()


@router.get("/api/health")
async def health():
    return {"status": "ok"}


@router.get("/api/lan-address")
async def lan_address():
    """
    Indirizzo del server come lo vede il resto della rete locale.

    Serve al Chromecast: la TV scarica il video da sé, quindi un URL su
    localhost punterebbe alla TV stessa e il cast fallirebbe.

    Il socket UDP non manda nessun pacchetto: serve solo a farsi dire dal
    sistema operativo quale interfaccia userebbe per uscire verso la rete,
    che è quella giusta anche con più schede (Wi-Fi + Ethernet + Docker).
    """
    ip = ""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except OSError:
        ip = ""
    finally:
        s.close()

    if not ip or ip.startswith("127."):
        return {"address": "", "port": SERVER_PORT}
    return {"address": f"http://{ip}:{SERVER_PORT}", "ip": ip, "port": SERVER_PORT}
