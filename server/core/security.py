"""
security.py — chi può far scrivere il server.

Il server ascolta su 0.0.0.0 e non ha login. Con allow_origins=["*"] bastava
che il browser di casa aprisse un sito qualunque perché quella pagina potesse
chiamare le API di YTProxy: cancellare i cookie, disiscrivere da un canale,
pubblicare un commento a nome dell'account. L'autenticazione vera resta fuori
discussione (è un server domestico), ma le richieste che *scrivono* ora devono
dichiarare un'origine locale.

Le GET non sono filtrate di proposito: il Chromecast scarica il video da sé,
senza mandare Origin, e /api/mux deve restargli raggiungibile.
"""
import os
import re

from fastapi import Request
from fastapi.responses import JSONResponse

_HOST_LOCALE = (
    r"(?:localhost"
    r"|127\.\d{1,3}\.\d{1,3}\.\d{1,3}"
    r"|\[::1\]"
    r"|10\.\d{1,3}\.\d{1,3}\.\d{1,3}"
    r"|192\.168\.\d{1,3}\.\d{1,3}"
    r"|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}"
    r"|[A-Za-z0-9-]+\.local)"
)
# capacitor:// e ionic:// non servono finché androidScheme resta "http" (vedi
# CLAUDE.md), ma coprono senza costi chi dovesse cambiarlo.
ORIGINI_LOCALI_RE = rf"^(?:https?|capacitor|ionic)://{_HOST_LOCALE}(?::\d+)?$"

# Per chi espone YTProxy dietro un reverse proxy, un dominio o una VPN
# (Tailscale, DuckDNS…): origini aggiuntive separate da virgola.
ORIGINI_EXTRA = [o.strip() for o in os.environ.get("YTPROXY_ALLOWED_ORIGINS", "").split(",") if o.strip()]

METODI_DI_SCRITTURA = {"POST", "PUT", "PATCH", "DELETE"}


def origine_ammessa(origin: str, host: str) -> bool:
    """True se da questa origine si può scrivere.

    `host` è l'header Host della richiesta: se combacia con l'origine siamo in
    same-origin, che va sempre bene — è la pagina servita dal server stesso,
    comunque la si raggiunga (localhost, IP di LAN, hostname, Tailscale).
    """
    if not origin:
        # Nessun Origin significa che non è una pagina web: curl, l'app nativa,
        # il Chromecast. Il browser lo manda sempre sulle richieste di scrittura,
        # e la pagina ostile da cui ci difendiamo è per forza in un browser.
        return True
    if origin in ORIGINI_EXTRA:
        return True
    if host and origin.split("://")[-1] == host:
        return True
    return bool(re.match(ORIGINI_LOCALI_RE, origin))


async def blocca_scritture_esterne(request: Request, call_next):
    if request.method in METODI_DI_SCRITTURA:
        if not origine_ammessa(request.headers.get("origin", ""),
                               request.headers.get("host", "")):
            return JSONResponse({"detail": "Origine non consentita"}, status_code=403)
    return await call_next(request)
