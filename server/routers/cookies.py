"""cookies.py — cookies.txt: upload manuale, cancellazione, import dal browser."""
from fastapi import APIRouter, File, HTTPException, Query, UploadFile

from auth import cookies as auth_cookies, cookies_import
from auth.state import state
from ytdlp.helpers import in_executor

router = APIRouter()


@router.post("/api/cookies/upload")
async def upload_cookies(file: UploadFile = File(...)):
    """Carica il file cookies.txt esportato dal browser."""
    content = (await file.read()).decode("utf-8", errors="ignore")
    result = auth_cookies.save_cookies(state, content)
    if not result["valid"]:
        raise HTTPException(400, "File cookie non valido. Esporta da Chrome/Firefox con l'estensione 'Get cookies.txt'")
    if not result["logged_in"]:
        return {**result, "message": (
            f"Cookie salvati ({result['cookie_count']}), ma non contengono una sessione YouTube: "
            "fai login su youtube.com nel browser da cui esporti, poi riesporta."
        )}
    return {**result, "message": f"Cookie salvati ({result['cookie_count']} cookie)"}


@router.delete("/api/cookies")
async def delete_cookies():
    auth_cookies.delete_cookies(state)
    return {"ok": True}


@router.get("/api/cookies/browsers")
async def cookies_browsers():
    """Browser installati SULLA MACCHINA CHE ESEGUE IL SERVER con una sessione YouTube attiva."""
    # Legge i database dei cookie di 7 browser: lento e sincrono, quindi in executor.
    browsers = await in_executor(cookies_import.detect_browsers_with_youtube_login)
    return {"browsers": browsers}


@router.post("/api/cookies/import")
async def import_cookies(browser: str = Query(...)):
    """Importa i cookie YouTube/Google direttamente dal database del browser indicato."""
    try:
        result = await in_executor(cookies_import.import_cookies_from_browser, state, browser)
    except Exception as ex:
        raise HTTPException(500, str(ex))
    if not result["valid"]:
        raise HTTPException(400, (
            f"In {browser.capitalize()} non c'è una sessione YouTube. Essere loggati su Google "
            "non basta: apri youtube.com in quel browser, verifica di essere loggato, poi riprova."
        ))
    return {**result, "message": f"Cookie importati da {browser.capitalize()} ({result['cookie_count']} cookie)"}
