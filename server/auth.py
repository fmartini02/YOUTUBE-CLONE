"""
auth.py — Google OAuth2 + Cookie management
Gestisce: login Google, refresh token automatico, cookie YouTube, sync iscrizioni
"""

import json
import os
import time
import asyncio
from pathlib import Path
from typing import Optional
import httpx

# ── Config paths ──────────────────────────────────────────────────────────────
DATA_DIR = Path(os.environ.get("YTPROXY_DATA", Path(__file__).parent.parent / "data"))
DATA_DIR.mkdir(exist_ok=True)

TOKEN_FILE = DATA_DIR / "oauth_token.json"
SUBS_FILE = DATA_DIR / "subscriptions.json"
COOKIE_FILE = DATA_DIR / "cookies.txt"
PREFS_FILE = DATA_DIR / "prefs.json"
HISTORY_FILE = DATA_DIR / "history.json"

# ── Google OAuth2 (YouTube Data API v3) ──────────────────────────────────────
# L'utente crea il suo Client ID su Google Cloud Console (gratuito)
# Scope: solo lettura iscrizioni e feed

OAUTH_SCOPES = "https://www.googleapis.com/auth/youtube.readonly"
OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"
YT_API_BASE = "https://www.googleapis.com/youtube/v3"


class AuthManager:
    def __init__(self):
        self._token: dict = {}
        self._subs: list = []
        self._prefs: dict = {}
        self._history: list = []
        self._load_all()
        self._sync_task = None

    def _load_all(self):
        if TOKEN_FILE.exists():
            self._token = json.loads(TOKEN_FILE.read_text())
        if SUBS_FILE.exists():
            self._subs = json.loads(SUBS_FILE.read_text())
        if PREFS_FILE.exists():
            self._prefs = json.loads(PREFS_FILE.read_text())
        if HISTORY_FILE.exists():
            self._history = json.loads(HISTORY_FILE.read_text())

    def _save_token(self):
        TOKEN_FILE.write_text(json.dumps(self._token, indent=2))

    def _save_subs(self):
        SUBS_FILE.write_text(json.dumps(self._subs, indent=2))

    def _save_prefs(self):
        PREFS_FILE.write_text(json.dumps(self._prefs, indent=2))

    def _save_history(self):
        HISTORY_FILE.write_text(json.dumps(self._history[-500:], indent=2))  # keep last 500

    # ── OAuth flow ────────────────────────────────────────────────────────────

    def get_auth_url(self, client_id: str, redirect_uri: str) -> str:
        """Step 1: genera URL per il login Google."""
        import urllib.parse
        params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": OAUTH_SCOPES,
            "access_type": "offline",
            "prompt": "consent",  # forza refresh_token
        }
        return f"{OAUTH_AUTH_URL}?{urllib.parse.urlencode(params)}"

    async def exchange_code(self, code: str, client_id: str, client_secret: str, redirect_uri: str) -> dict:
        """Step 2: scambia il code con access_token + refresh_token."""
        async with httpx.AsyncClient() as client:
            r = await client.post(OAUTH_TOKEN_URL, data={
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            })
            data = r.json()
            if "error" in data:
                raise ValueError(data.get("error_description", data["error"]))

            self._token = {
                "access_token": data["access_token"],
                "refresh_token": data.get("refresh_token"),
                "expires_at": time.time() + data.get("expires_in", 3600),
                "client_id": client_id,
                "client_secret": client_secret,
            }
            self._save_token()
            return self._token

    async def refresh_access_token(self) -> Optional[str]:
        """Rinnova automaticamente l'access token."""
        if not self._token.get("refresh_token"):
            return None
        try:
            async with httpx.AsyncClient() as client:
                r = await client.post(OAUTH_TOKEN_URL, data={
                    "refresh_token": self._token["refresh_token"],
                    "client_id": self._token["client_id"],
                    "client_secret": self._token["client_secret"],
                    "grant_type": "refresh_token",
                })
                data = r.json()
                if "access_token" in data:
                    self._token["access_token"] = data["access_token"]
                    self._token["expires_at"] = time.time() + data.get("expires_in", 3600)
                    self._save_token()
                    return self._token["access_token"]
        except Exception as e:
            print(f"[auth] Refresh token error: {e}")
        return None

    async def get_valid_token(self) -> Optional[str]:
        """Restituisce sempre un token valido, rinnovandolo se necessario."""
        if not self._token:
            return None
        # Rinnova se scade nei prossimi 5 minuti
        if time.time() > self._token.get("expires_at", 0) - 300:
            return await self.refresh_access_token()
        return self._token.get("access_token")

    def is_authenticated(self) -> bool:
        return bool(self._token.get("refresh_token"))

    def logout(self):
        self._token = {}
        if TOKEN_FILE.exists():
            TOKEN_FILE.unlink()

    # ── Subscriptions sync ────────────────────────────────────────────────────

    async def sync_subscriptions(self) -> list:
        """Scarica tutte le iscrizioni dal canale Google dell'utente."""
        token = await self.get_valid_token()
        if not token:
            return self._subs  # fallback cache

        subs = []
        next_page = None

        async with httpx.AsyncClient() as client:
            while True:
                params = {
                    "part": "snippet",
                    "mine": "true",
                    "maxResults": 50,
                    "order": "alphabetical",
                }
                if next_page:
                    params["pageToken"] = next_page

                r = await client.get(
                    f"{YT_API_BASE}/subscriptions",
                    params=params,
                    headers={"Authorization": f"Bearer {token}"},
                    timeout=15,
                )
                data = r.json()

                if "error" in data:
                    # Token scaduto o revocato
                    print(f"[auth] API error: {data['error']}")
                    break

                for item in data.get("items", []):
                    snippet = item.get("snippet", {})
                    subs.append({
                        "id": snippet.get("resourceId", {}).get("channelId"),
                        "name": snippet.get("title"),
                        "thumbnail": snippet.get("thumbnails", {}).get("default", {}).get("url"),
                        "description": snippet.get("description", "")[:100],
                    })

                next_page = data.get("nextPageToken")
                if not next_page:
                    break

        if subs:
            self._subs = subs
            self._save_subs()

        return self._subs

    def get_subscriptions(self) -> list:
        return self._subs

    # ── Cookie management ─────────────────────────────────────────────────────

    def save_cookies(self, content: str) -> dict:
        """Salva il file cookies.txt caricato dall'utente."""
        COOKIE_FILE.write_text(content)
        # Verifica che sia un file Netscape cookies valido
        valid = "# Netscape HTTP Cookie File" in content or ".youtube.com" in content
        line_count = len([l for l in content.splitlines() if l and not l.startswith("#")])
        return {"valid": valid, "cookie_count": line_count}

    def get_cookie_path(self) -> Optional[str]:
        if COOKIE_FILE.exists() and COOKIE_FILE.stat().st_size > 0:
            return str(COOKIE_FILE)
        return None

    def get_cookie_status(self) -> dict:
        if not COOKIE_FILE.exists():
            return {"present": False, "age_days": None, "warning": False}
        age = (time.time() - COOKIE_FILE.stat().st_mtime) / 86400
        return {
            "present": True,
            "age_days": round(age, 1),
            "warning": age > 14,  # avvisa dopo 2 settimane
        }

    def delete_cookies(self):
        if COOKIE_FILE.exists():
            COOKIE_FILE.unlink()

    # ── Watch history ─────────────────────────────────────────────────────────

    def add_to_history(self, video: dict):
        """Aggiunge un video alla cronologia locale."""
        # Rimuovi duplicati
        self._history = [h for h in self._history if h.get("id") != video.get("id")]
        self._history.insert(0, {
            "id": video.get("id"),
            "title": video.get("title"),
            "channel": video.get("channel"),
            "thumbnail": video.get("thumbnail"),
            "watched_at": time.time(),
        })
        self._save_history()

    def get_history(self, limit: int = 50) -> list:
        return self._history[:limit]

    def clear_history(self):
        self._history = []
        self._save_history()

    # ── Preferences ──────────────────────────────────────────────────────────

    def get_prefs(self) -> dict:
        return {
            "quality": self._prefs.get("quality", "best"),
            "autoplay": self._prefs.get("autoplay", True),
            "notifications_cookie_warning": self._prefs.get("notifications_cookie_warning", True),
            "theme": self._prefs.get("theme", "dark"),
        }

    def update_prefs(self, updates: dict) -> dict:
        self._prefs.update(updates)
        self._save_prefs()
        return self.get_prefs()

    # ── Feed personalizzato ───────────────────────────────────────────────────

    async def get_personalized_feed(self, ydl_opts_base_fn) -> list:
        """
        Tenta feed via cookie (reale), fallback su feed dai canali iscritti.
        """
        cookie_path = self.get_cookie_path()

        # Strategia 1: feed homepage con cookie
        if cookie_path:
            try:
                import yt_dlp
                opts = {
                    **ydl_opts_base_fn(),
                    "cookiefile": cookie_path,
                    "playlistend": 30,
                }
                with yt_dlp.YoutubeDL(opts) as ydl:
                    info = ydl.extract_info("https://www.youtube.com/feed/subscriptions", download=False)
                    entries = (info or {}).get("entries", [])
                    results = []
                    for e in (entries or []):
                        if not e:
                            continue
                        results.append({
                            "id": e.get("id"),
                            "title": e.get("title"),
                            "channel": e.get("uploader") or e.get("channel"),
                            "duration": e.get("duration"),
                            "views": e.get("view_count"),
                            "thumbnail": f"https://i.ytimg.com/vi/{e.get('id')}/hqdefault.jpg",
                            "published": e.get("upload_date"),
                        })
                    if results:
                        return results
            except Exception as e:
                print(f"[auth] Cookie feed error: {e}")

        # Strategia 2: ultimi video dai canali iscritti
        if self._subs:
            return await self._feed_from_subscriptions(ydl_opts_base_fn)

        return []  # nessun dato disponibile

    async def _feed_from_subscriptions(self, ydl_opts_base_fn) -> list:
        """Scarica gli ultimi video dai primi 10 canali iscritti."""
        import yt_dlp
        results = []
        # Prendi i primi 10 canali per non esagerare con le richieste
        channels = self._subs[:10]

        for ch in channels:
            if not ch.get("id"):
                continue
            try:
                opts = {
                    **ydl_opts_base_fn(),
                    "playlistend": 3,
                }
                with yt_dlp.YoutubeDL(opts) as ydl:
                    info = ydl.extract_info(
                        f"https://www.youtube.com/channel/{ch['id']}/videos",
                        download=False,
                    )
                    for e in (info or {}).get("entries", []):
                        if not e:
                            continue
                        results.append({
                            "id": e.get("id"),
                            "title": e.get("title"),
                            "channel": ch["name"],
                            "duration": e.get("duration"),
                            "views": e.get("view_count"),
                            "thumbnail": f"https://i.ytimg.com/vi/{e.get('id')}/hqdefault.jpg",
                            "published": e.get("upload_date"),
                        })
            except Exception:
                continue

        # Ordina per data più recente
        results.sort(key=lambda x: x.get("published") or "0", reverse=True)
        return results[:30]


# Singleton
auth_manager = AuthManager()
