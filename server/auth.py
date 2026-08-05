"""
auth.py — Google OAuth2 + Cookie management
Gestisce: login Google, refresh token automatico, cookie YouTube, sync iscrizioni
"""

import json
import os
import time
import asyncio
from collections import OrderedDict
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
AVATAR_CACHE_FILE = DATA_DIR / "channel_avatars.json"
SUBS_FEED_CACHE_FILE = DATA_DIR / "subscriptions_feed_cache.json"

# ── Google OAuth2 (YouTube Data API v3) ──────────────────────────────────────
# L'utente crea il suo Client ID su Google Cloud Console (gratuito)
# Scope: solo lettura iscrizioni e feed

COOKIE_FEED_CACHE_TTL = 300  # 5 minuti: evita di ri-scaricare da YouTube ad ogni "carica altri"

# Il feed home viene estratto PIGRAMENTE, un blocco alla volta, man mano che
# l'utente scorre (vedi LazyFeed): scaricarlo tutto in anticipo significherebbe
# decine di richieste consecutive a YouTube — la raffica che può far invalidare
# la sessione dei cookie — per video che magari non verranno mai guardati.
FEED_MAX = 10000               # tetto di sicurezza; in pratica finisce prima YouTube
FEED_CHUNK = 30                # video per blocco (≈ 1 richiesta di continuazione)
FEED_CACHE_TTL = 1800          # 30 min: dopo tanto, un nuovo scroll riparte da capo
RELATED_CHUNK = 25             # il mix di YouTube arriva a blocchi di ~25
RELATED_MAX = 2000             # nessuno scorre così tanto la sidebar dei correlati
# Ogni feed aperto tiene viva un'istanza di yt-dlp: la home più i mix degli
# ultimi video guardati bastano, gli altri si chiudono.
MAX_OPEN_FEEDS = 6

# youtube.readonly basta per leggere iscrizioni e loghi, ma NON per scrivere:
# per pubblicare un commento Google pretende youtube.force-ssl (che include
# anche tutta la lettura). Chi si era collegato con il vecchio scope ha un
# refresh token che non lo comprende: il token continua a funzionare per le
# iscrizioni, ma commentThreads.insert risponde 403 insufficientPermissions
# finché non rifà il login (vedi can_comment / COMMENT_SCOPE).
COMMENT_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl"
OAUTH_SCOPES = f"https://www.googleapis.com/auth/youtube.readonly {COMMENT_SCOPE}"
OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"
YT_API_BASE = "https://www.googleapis.com/youtube/v3"


class YouTubeAPIError(Exception):
    """
    Errore restituito dalla Data API, con il 'reason' di Google conservato:
    serve a distinguere i casi che l'utente può risolvere (commenti
    disattivati sul video, scope insufficiente, quota finita) da un guasto.
    """
    def __init__(self, message: str, reason: str = "", status: int = 400):
        super().__init__(message)
        self.message = message
        self.reason = reason
        self.status = status


def _iso_to_timestamp(iso: Optional[str]) -> Optional[int]:
    """publishedAt della Data API (ISO 8601 UTC) → unix timestamp, come i commenti di yt-dlp."""
    if not iso:
        return None
    from datetime import datetime
    try:
        return int(datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp())
    except Exception:
        return None


def _timestamp_to_upload_date(ts) -> Optional[str]:
    """Converte un unix timestamp (anche approssimato, vedi extractor_args approximate_date) in YYYYMMDD."""
    if not ts:
        return None
    from datetime import datetime, timezone
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y%m%d")


def is_video_entry(e) -> bool:
    """
    Scarta le voci che non sono video singoli. I feed di YouTube includono
    anche i "Mix" (playlist auto-generate, id tipo RD...): non hanno copertina
    — l'URL i.ytimg.com/vi/<id> dà 404 — e aprirli come video non funziona.
    Gli id dei video sono sempre di 11 caratteri, quelli di playlist più lunghi.
    """
    vid = (e or {}).get("id")
    return bool(vid) and len(vid) == 11


def map_video_entry(e: dict) -> dict:
    """Voce grezza di yt-dlp → formato usato dal frontend."""
    return {
        "id": e.get("id"),
        "title": e.get("title"),
        "channel": e.get("uploader") or e.get("channel"),
        "channel_id": e.get("channel_id"),
        "duration": e.get("duration"),
        "views": e.get("view_count"),
        "thumbnail": f"https://i.ytimg.com/vi/{e.get('id')}/hqdefault.jpg",
        "published": _timestamp_to_upload_date(e.get("timestamp")),
    }


class LazyFeed:
    """
    Estrazione pigra di un feed YouTube, a blocchi.

    yt-dlp scarica il feed una "pagina di continuazione" alla volta (~30 video
    per richiesta HTTP) e restituisce un generatore. Consumandolo tutto subito
    si pagano decine di richieste in una raffica; tenendolo invece vivo fra una
    chiamata e l'altra si scarica solo quello che serve, quando serve — cioè
    man mano che l'utente scorre.

    Attenzione: il generatore è codice bloccante e non è thread-safe, quindi
    extend() va chiamato da un solo thread alla volta (vedi il lock nel chiamante).
    """

    def __init__(self, url: str, opts: dict):
        import yt_dlp
        self._ydl = yt_dlp.YoutubeDL(opts)
        # process=False evita che yt-dlp materializzi l'intera lista: è ciò che
        # mantiene pigro il generatore.
        info = self._ydl.extract_info(url, download=False, process=False)
        self._iter = iter((info or {}).get("entries") or [])
        self.items: list = []
        self.exhausted = False
        self.created_at = time.time()
        self._persist_cookies()

    def _persist_cookies(self):
        """
        Riscrive su disco i cookie aggiornati da YouTube.

        Ad ogni richiesta YouTube ruota alcuni cookie di sessione (SIDCC e
        simili) e si aspetta che il client usi i nuovi. yt-dlp lo fa in memoria
        e li salva sul file solo alla chiusura dell'istanza: siccome qui
        l'istanza resta viva a lungo, senza questa chiamata continueremmo a
        ripartire da cookie ormai vecchi — ed è così che la sessione viene
        invalidata da YouTube.
        """
        try:
            self._ydl.save_cookies()
        except Exception as e:
            print(f"[auth] Impossibile salvare i cookie aggiornati: {e}")

    def extend(self, count: int) -> int:
        """Tira fuori altri `count` video dal generatore. Ritorna quanti ne ha aggiunti."""
        import itertools
        added = 0
        # Le voci scartate (Mix/playlist) non contano verso il totale richiesto,
        # altrimenti un blocco pieno di Mix restituirebbe una pagina mezza vuota.
        while added < count and not self.exhausted:
            batch = list(itertools.islice(self._iter, count - added))
            if not batch:
                self.exhausted = True
                break
            for e in batch:
                if is_video_entry(e):
                    self.items.append(map_video_entry(e))
                    added += 1
        # Ogni blocco è una richiesta a YouTube, che può aver ruotato i cookie.
        self._persist_cookies()
        return added

    def close(self):
        try:
            self._ydl.close()
        except Exception:
            pass


class AuthManager:
    def __init__(self):
        self._token: dict = {}
        self._subs: list = []
        self._prefs: dict = {}
        self._history: list = []
        self._avatar_cache: dict = {}
        # Canale YouTube dell'account collegato (nome/avatar per la casella
        # "commenta come"): None = mai letto, {} = account senza canale.
        self._me: Optional[dict] = None
        self._subs_feed_cache: list = []
        self._cookie_feed_cache: list = []
        self._cookie_feed_cache_at: float = 0
        # Estrattori pigri tenuti vivi fra una richiesta e l'altra per poter
        # continuare ogni feed da dove era arrivato (vedi LazyFeed): la home e
        # il mix dei video aperti di recente. Dict ordinato = cache LRU.
        self._feeds: "OrderedDict[str, LazyFeed]" = OrderedDict()
        # Un lock per feed: il generatore di yt-dlp non è thread-safe e due
        # scroll paralleli (due schede, o un refresh) lo corromperebbero.
        self._feed_locks: dict = {}
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
        if AVATAR_CACHE_FILE.exists():
            self._avatar_cache = json.loads(AVATAR_CACHE_FILE.read_text())
        if SUBS_FEED_CACHE_FILE.exists():
            self._subs_feed_cache = json.loads(SUBS_FEED_CACHE_FILE.read_text())

    def _save_token(self):
        TOKEN_FILE.write_text(json.dumps(self._token, indent=2))

    def _save_subs(self):
        SUBS_FILE.write_text(json.dumps(self._subs, indent=2))

    def _save_prefs(self):
        PREFS_FILE.write_text(json.dumps(self._prefs, indent=2))

    def _save_history(self):
        HISTORY_FILE.write_text(json.dumps(self._history[-500:], indent=2))  # keep last 500

    def _save_avatar_cache(self):
        AVATAR_CACHE_FILE.write_text(json.dumps(self._avatar_cache, indent=2))

    def _save_subs_feed_cache(self):
        SUBS_FEED_CACHE_FILE.write_text(json.dumps(self._subs_feed_cache, indent=2))

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
                # Google restituisce gli scope effettivamente concessi: li
                # teniamo per sapere se questo token può anche commentare.
                "scope": data.get("scope", ""),
            }
            self._me = None  # identità dell'account: da rileggere
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
                    if data.get("scope"):
                        self._token["scope"] = data["scope"]
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
        self._me = None
        if TOKEN_FILE.exists():
            TOKEN_FILE.unlink()

    def can_comment(self) -> bool:
        """
        True solo se il token collegato comprende lo scope di scrittura.
        Un account collegato prima dell'introduzione dei commenti è
        autenticato ma non può pubblicare: serve rifare il login.
        """
        return self.is_authenticated() and COMMENT_SCOPE in (self._token.get("scope") or "")

    # ── Commenti (YouTube Data API v3) ────────────────────────────────────────
    #
    # Per la sola lettura yt-dlp basterebbe, ma restituisce i commenti in blocco
    # (nessuna continuazione riutilizzabile fra una richiesta e l'altra) e non
    # può in alcun modo pubblicare. Con l'account collegato usiamo quindi la
    # Data API: ha una paginazione vera (nextPageToken), quindi "carica altri
    # commenti" è una richiesta piccola invece di ri-scaricare tutto, e le
    # risposte ai thread si possono chiedere solo quando servono.
    # Costo quota: 1 unità a lettura, 50 a commento pubblicato (su 10.000/giorno).

    async def _yt_api(self, method: str, path: str, *, params: dict = None, json_body: dict = None) -> dict:
        """Chiamata autenticata alla Data API. Solleva ValueError col messaggio di Google."""
        token = await self.get_valid_token()
        if not token:
            raise PermissionError("Nessun account Google collegato")
        async with httpx.AsyncClient() as client:
            r = await client.request(
                method,
                f"{YT_API_BASE}/{path}",
                params=params,
                json=json_body,
                headers={"Authorization": f"Bearer {token}"},
                timeout=20,
            )
        try:
            data = r.json()
        except Exception:
            raise ValueError(f"Risposta non valida da YouTube ({r.status_code})")
        if "error" in data:
            err = data["error"]
            reason = ""
            if err.get("errors"):
                reason = err["errors"][0].get("reason", "")
            raise YouTubeAPIError(err.get("message", "Errore YouTube"), reason, r.status_code)
        return data

    async def get_my_channel(self) -> Optional[dict]:
        """Canale YouTube dell'account collegato (nome + avatar), per la casella 'commenta come'."""
        if self._me is not None:
            return self._me or None
        if not self.is_authenticated():
            return None
        try:
            data = await self._yt_api("GET", "channels", params={"part": "snippet", "mine": "true"})
            items = data.get("items") or []
            if not items:
                # Account Google senza canale YouTube: non può commentare.
                self._me = {}
                return None
            sn = items[0].get("snippet", {})
            self._me = {
                "channel_id": items[0].get("id"),
                "title": sn.get("title"),
                "thumbnail": (sn.get("thumbnails", {}).get("default") or {}).get("url"),
            }
            return self._me
        except Exception as e:
            print(f"[auth] get_my_channel: {e}")
            return None

    def _map_api_comment(self, snippet: dict, comment_id: str, extra: dict = None) -> dict:
        """Commento della Data API → stessa forma di quelli estratti da yt-dlp."""
        out = {
            "id": comment_id,
            "text": snippet.get("textOriginal") or snippet.get("textDisplay") or "",
            "author": snippet.get("authorDisplayName"),
            "author_thumbnail": snippet.get("authorProfileImageUrl"),
            "author_channel_id": (snippet.get("authorChannelId") or {}).get("value"),
            "author_is_uploader": False,  # riempito da chi conosce il canale del video
            "likes": snippet.get("likeCount") or 0,
            "published": _iso_to_timestamp(snippet.get("publishedAt")),
            "reply_count": 0,
        }
        if extra:
            out.update(extra)
        return out

    async def list_comment_threads(self, video_id: str, sort: str, page_token: str = "", limit: int = 40) -> dict:
        """Una pagina di commenti principali + il token per la successiva (vuoto = finiti)."""
        params = {
            "part": "snippet",
            "videoId": video_id,
            "order": "time" if sort == "new" else "relevance",
            "maxResults": max(1, min(limit, 100)),
            "textFormat": "plainText",
        }
        if page_token:
            params["pageToken"] = page_token
        data = await self._yt_api("GET", "commentThreads", params=params)
        comments = []
        for item in data.get("items", []):
            sn = item.get("snippet", {})
            top = sn.get("topLevelComment", {})
            comments.append(self._map_api_comment(
                top.get("snippet", {}),
                top.get("id") or item.get("id"),
                {"reply_count": sn.get("totalReplyCount") or 0},
            ))
        # pageInfo.totalResults di commentThreads è il numero di risultati
        # della PAGINA, non del video: per il totale vero serve la scheda
        # statistiche, che chiediamo una volta sola (prima pagina).
        total = None
        if not page_token:
            total = await self.get_video_comment_count(video_id)
        return {
            "comments": comments,
            "next_page_token": data.get("nextPageToken", ""),
            "total": total,
        }

    async def get_video_comment_count(self, video_id: str) -> Optional[int]:
        """Numero totale di commenti del video (statistiche della Data API)."""
        try:
            data = await self._yt_api("GET", "videos", params={"part": "statistics", "id": video_id})
            items = data.get("items") or []
            if items:
                n = (items[0].get("statistics") or {}).get("commentCount")
                return int(n) if n is not None else None
        except Exception as e:
            print(f"[auth] comment count: {e}")
        return None

    async def list_comment_replies(self, parent_id: str, page_token: str = "", limit: int = 50) -> dict:
        """Risposte a un commento — caricate solo quando l'utente le apre."""
        params = {
            "part": "snippet",
            "parentId": parent_id,
            "maxResults": max(1, min(limit, 100)),
            # Senza questo la API restituisce HTML (<br>, &quot;, link <a>) che
            # React stamperebbe alla lettera dentro il testo del commento.
            "textFormat": "plainText",
        }
        if page_token:
            params["pageToken"] = page_token
        data = await self._yt_api("GET", "comments", params=params)
        replies = [
            self._map_api_comment(item.get("snippet", {}), item.get("id"))
            for item in data.get("items", [])
        ]
        # La API le dà dalla più vecchia alla più recente: è l'ordine di lettura.
        return {"comments": replies, "next_page_token": data.get("nextPageToken", "")}

    async def post_comment(self, video_id: str, text: str) -> dict:
        """Pubblica un commento principale sul video."""
        data = await self._yt_api("POST", "commentThreads", params={"part": "snippet"}, json_body={
            "snippet": {"videoId": video_id, "topLevelComment": {"snippet": {"textOriginal": text}}},
        })
        top = (data.get("snippet") or {}).get("topLevelComment") or {}
        return self._map_api_comment(top.get("snippet", {}), top.get("id") or data.get("id"))

    async def post_reply(self, parent_id: str, text: str) -> dict:
        """Pubblica una risposta a un commento esistente."""
        data = await self._yt_api("POST", "comments", params={"part": "snippet"}, json_body={
            "snippet": {"parentId": parent_id, "textOriginal": text},
        })
        return self._map_api_comment(data.get("snippet", {}), data.get("id"))

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

    @staticmethod
    def _parse_netscape(content: str):
        """(dominio, nome) di ogni cookie in un file in formato Netscape."""
        for line in content.splitlines():
            if not line or line.startswith("#"):
                continue
            parts = line.split("\t")
            if len(parts) >= 6:
                yield parts[0], parts[5]

    def save_cookies(self, content: str) -> dict:
        """
        Salva il file cookies.txt caricato dall'utente.

        Salva anche quando la sessione non risulta loggata (il file può servire
        lo stesso per aggirare i blocchi anti-bot), ma lo segnala con
        logged_in=False: senza login YouTube non restituisce alcun feed
        personalizzato, ed è meglio dirlo subito che farlo scoprire da una home
        che mostra i trending.
        """
        COOKIE_FILE.write_text(content)
        pairs = list(self._parse_netscape(content))
        valid = "# Netscape HTTP Cookie File" in content or any(
            d.endswith("youtube.com") for d, _ in pairs
        )
        return {
            "valid": valid,
            "cookie_count": len(pairs),
            "logged_in": bool(self._youtube_auth_cookies(pairs)),
        }

    # ── Import automatico cookie dal browser (niente estensioni/export manuale) ─
    #
    # yt-dlp sa leggere i cookie direttamente dal database del browser, ma su
    # Linux cerca solo il percorso standard (~/.config/...). Se il browser è
    # installato via snap (comune su Ubuntu: Brave, Chromium, Firefox), snap
    # confina i suoi dati reali in ~/snap/<pkg>/... e quel percorso standard è
    # vuoto o non aggiornato — va indicato esplicitamente.
    _SNAP_PROFILE_HINTS = {
        "brave": "~/snap/brave/current/.config/BraveSoftware/Brave-Browser",
        "chromium": "~/snap/chromium/current/.config/chromium",
        "firefox": "~/snap/firefox/common/.mozilla/firefox",
    }
    # Cookie che provano una sessione YouTube di PRIMA PARTE. Devono stare sul
    # dominio youtube.com: i cookie omonimi su google.com non vengono mai
    # inviati a youtube.com, quindi non autenticano nulla. Il caso insidioso è
    # essere loggati su Google ma non aver mai aperto YouTube in quel browser:
    # il profilo contiene i cookie google.com e i soli "3P" di youtube.com
    # (__Secure-3PSID e simili, impostati cross-site), che YouTube considera
    # comunque anonimi. Un file così sembra pieno ma dà feed vuoti.
    _AUTH_COOKIE_NAMES = {"SID", "__Secure-1PSID", "LOGIN_INFO", "SAPISID"}
    _CANDIDATE_BROWSERS = ("brave", "chrome", "chromium", "edge", "firefox", "vivaldi", "opera")

    @classmethod
    def _youtube_auth_cookies(cls, names_by_domain) -> set:
        """Quali cookie di autenticazione YouTube (prima parte) sono presenti."""
        found = set()
        for domain, name in names_by_domain:
            if domain.endswith("youtube.com") and name in cls._AUTH_COOKIE_NAMES:
                found.add(name)
        return found

    def _browser_profile_path(self, browser: str) -> Optional[str]:
        hint = self._SNAP_PROFILE_HINTS.get(browser)
        if not hint:
            return None
        path = os.path.expanduser(hint)
        return path if os.path.isdir(path) else None

    def _extract_browser_jar(self, browser: str):
        import yt_dlp.cookies as ytc
        return ytc.extract_cookies_from_browser(browser, self._browser_profile_path(browser))

    def detect_browsers_with_youtube_login(self) -> list:
        """
        Browser con una sessione YouTube vera e propria.

        Il controllo è sui cookie del dominio youtube.com: bastava trovarli su
        google.com per proporre un browser che poi importava una sessione
        anonima, e la home ricadeva silenziosamente sui trending.
        """
        found = []
        for browser in self._CANDIDATE_BROWSERS:
            try:
                jar = self._extract_browser_jar(browser)
            except Exception:
                continue
            if self._youtube_auth_cookies((ck.domain, ck.name) for ck in jar):
                found.append(browser)
        return found

    def import_cookies_from_browser(self, browser: str) -> dict:
        """
        Estrae i cookie YouTube/Google dal browser indicato e li salva come
        cookies.txt — nessun passaggio manuale.

        Rifiuta l'import se nel profilo non c'è una sessione YouTube di prima
        parte: salvare comunque il file produrrebbe un cookies.txt di aspetto
        normale (decine di cookie google.com) che però lascia yt-dlp anonimo.
        """
        import yt_dlp.cookies as ytc
        jar = self._extract_browser_jar(browser)
        out_jar = ytc.YoutubeDLCookieJar()
        count = 0
        for ck in jar:
            if ck.domain.endswith(("youtube.com", "google.com")):
                out_jar.set_cookie(ck)
                count += 1
        auth = self._youtube_auth_cookies((ck.domain, ck.name) for ck in jar)
        if not auth:
            return {"valid": False, "cookie_count": count, "logged_in": False}
        out_jar.save(str(COOKIE_FILE), ignore_discard=True, ignore_expires=True)
        return {"valid": True, "cookie_count": count, "logged_in": True}

    # ── Import automatico cookie dal browser (niente estensioni/export manuale) ─
    #
    # yt-dlp sa leggere i cookie direttamente dal database del browser, ma su
    # Linux cerca solo il percorso standard (~/.config/...). Se il browser è
    # installato via snap (comune su Ubuntu: Brave, Chromium, Firefox), snap
    # confina i suoi dati reali in ~/snap/<pkg>/... e quel percorso standard è
    # vuoto o non aggiornato — va indicato esplicitamente.
    _SNAP_PROFILE_HINTS = {
        "brave": "~/snap/brave/current/.config/BraveSoftware/Brave-Browser",
        "chromium": "~/snap/chromium/current/.config/chromium",
        "firefox": "~/snap/firefox/common/.mozilla/firefox",
    }
    _AUTH_COOKIE_NAMES = {"SID", "__Secure-1PSID", "LOGIN_INFO", "SAPISID"}
    _CANDIDATE_BROWSERS = ("brave", "chrome", "chromium", "edge", "firefox", "vivaldi", "opera")

    def _browser_profile_path(self, browser: str) -> Optional[str]:
        hint = self._SNAP_PROFILE_HINTS.get(browser)
        if not hint:
            return None
        path = os.path.expanduser(hint)
        return path if os.path.isdir(path) else None

    def _extract_browser_jar(self, browser: str):
        import yt_dlp.cookies as ytc
        return ytc.extract_cookies_from_browser(browser, self._browser_profile_path(browser))

    def detect_browsers_with_youtube_login(self) -> list:
        """Prova ogni browser noto e ritorna quelli con una sessione YouTube/Google attiva."""
        found = []
        for browser in self._CANDIDATE_BROWSERS:
            try:
                jar = self._extract_browser_jar(browser)
            except Exception:
                continue
            names = {ck.name for ck in jar if ck.domain.endswith(("youtube.com", "google.com"))}
            if names & self._AUTH_COOKIE_NAMES:
                found.append(browser)
        return found

    def import_cookies_from_browser(self, browser: str) -> dict:
        """Estrae i cookie YouTube/Google dal browser indicato e li salva come cookies.txt — nessun passaggio manuale."""
        import yt_dlp.cookies as ytc
        jar = self._extract_browser_jar(browser)
        out_jar = ytc.YoutubeDLCookieJar()
        count = 0
        for ck in jar:
            if ck.domain.endswith(("youtube.com", "google.com")):
                out_jar.set_cookie(ck)
                count += 1
        if count == 0:
            return {"valid": False, "cookie_count": 0}
        out_jar.save(str(COOKIE_FILE), ignore_discard=True, ignore_expires=True)
        return {"valid": True, "cookie_count": count}

    def get_cookie_path(self) -> Optional[str]:
        if COOKIE_FILE.exists() and COOKIE_FILE.stat().st_size > 0:
            return str(COOKIE_FILE)
        return None

    def get_cookie_status(self) -> dict:
        if not COOKIE_FILE.exists():
            return {"present": False, "age_days": None, "warning": False,
                    "logged_in": False, "reason": None}
        age = (time.time() - COOKIE_FILE.stat().st_mtime) / 86400
        try:
            pairs = list(self._parse_netscape(COOKIE_FILE.read_text()))
        except Exception:
            pairs = []
        # Senza cookie di sessione youtube.com il file c'è ma non autentica:
        # va segnalato come un problema quanto un file scaduto.
        logged_in = bool(self._youtube_auth_cookies(pairs))
        # `reason` distingue due problemi che chiedono rimedi diversi: un file
        # vecchio si risolve riesportandolo, un file senza sessione YouTube no
        # — lì bisogna prima aprire youtube.com nel browser. Senza questa
        # distinzione l'avviso diceva "hanno più di 2 settimane" anche nel
        # secondo caso, e reimportare i cookie non lo faceva sparire mai.
        reason = "not-logged-in" if not logged_in else ("stale" if age > 14 else None)
        return {
            "present": True,
            "age_days": round(age, 1),
            "logged_in": logged_in,
            "reason": reason,
            "warning": reason is not None,  # avvisa dopo 2 settimane
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

    # ── Paginazione pigra condivisa (home e correlati) ───────────────────────

    async def _lazy_page(self, key: str, url: str, offset: int, limit: int,
                         opts: dict, chunk: int, cap: int) -> dict:
        """
        Una pagina di un feed estratto pigramente, tenendo vivo il generatore
        di yt-dlp fra una richiesta e l'altra (vedi LazyFeed).

        `key` identifica il feed da riprendere: "home" per le raccomandazioni,
        "related:<id>" per il mix di un video. I feed aperti restano in una
        piccola cache LRU perché ognuno tiene aperta un'istanza di yt-dlp.
        """
        lock = self._feed_locks.setdefault(key, asyncio.Lock())
        # Un solo estrattore alla volta per feed: il generatore di yt-dlp non è
        # thread-safe e due scroll paralleli lo corromperebbero.
        async with lock:
            feed = self._feeds.get(key)
            # Il TTL vale solo a inizio scorrimento. Ricreare il feed a metà
            # paginazione (offset alto) vorrebbe dire ri-scaricare centinaia di
            # video per servire una pagina, e con un ordine diverso: l'utente
            # vedrebbe lo scroll fermarsi o ripetere gli stessi video. Un feed
            # già iniziato prosegue quindi finché non si esaurisce davvero.
            scaduto = feed is not None and offset == 0 and time.time() - feed.created_at > FEED_CACHE_TTL
            if feed is None or scaduto:
                if feed is not None:
                    feed.close()
                    self._feeds.pop(key, None)
                feed = await self._open_lazy_feed(url, opts)
                if feed is None:
                    return {"results": [], "total": 0, "has_more": False}
            self._remember_feed(key, feed)

            # Estende quanto basta a coprire la pagina richiesta: scorrere poco
            # costa poche richieste a YouTube.
            needed = offset + limit
            loop = asyncio.get_event_loop()
            while len(feed.items) < needed and not feed.exhausted and len(feed.items) < cap:
                before = len(feed.items)
                try:
                    await loop.run_in_executor(None, feed.extend, chunk)
                except Exception as e:
                    print(f"[auth] Errore estensione feed '{key}': {e}")
                    feed.exhausted = True
                    break
                if len(feed.items) == before:
                    # Nessun progresso pur non essendo esaurito: evita di
                    # ciclare all'infinito su un feed che non avanza più.
                    feed.exhausted = True
                    break

            items = feed.items
            return {
                "results": items[offset:offset + limit],
                "total": len(items),
                # C'è altro se il feed può ancora crescere, o se abbiamo già in
                # memoria voci oltre la pagina appena servita.
                "has_more": ((not feed.exhausted) and len(items) < cap) or offset + limit < len(items),
            }

    def _remember_feed(self, key: str, feed: "LazyFeed"):
        """
        Segna il feed come usato di recente, chiudendo i meno usati oltre il
        limite: ogni istanza di yt-dlp tenuta viva costa memoria e socket.
        """
        self._feeds[key] = feed
        self._feeds.move_to_end(key)
        while len(self._feeds) > MAX_OPEN_FEEDS:
            # Salta i feed con il lock preso: un'altra richiesta li sta usando
            # proprio ora e chiuderli le farebbe fallire lo scroll.
            def _libero(k):
                lock = self._feed_locks.get(k)
                return lock is None or not lock.locked()

            evictable = [k for k in self._feeds if _libero(k)]
            if not evictable:
                break
            old_key = evictable[0]
            old = self._feeds.pop(old_key)
            self._feed_locks.pop(old_key, None)
            old.close()

    async def _open_lazy_feed(self, url: str, opts: dict):
        """Apre il feed (prima richiesta a YouTube). None se fallisce."""
        try:
            # extract_info è bloccante: in un thread separato, altrimenti
            # fermerebbe l'intero event loop di FastAPI (niente riproduzione,
            # niente ricerche) per tutta la durata dell'estrazione.
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, lambda: LazyFeed(url, opts))
        except Exception as e:
            print(f"[auth] Errore apertura feed {url}: {e}")
            return None

    # ── Feed Home (raccomandazioni, non solo iscrizioni) ─────────────────────

    async def get_home_feed_page(self, offset: int, limit: int, ydl_opts_base_fn) -> dict:
        """
        Una pagina della home di YouTube: le tue raccomandazioni reali.

        Servono i cookie di una sessione YouTube loggata — non esiste altro
        modo di ottenere le raccomandazioni personali. Ritorna
        {"results", "total", "has_more", "reason"}; `reason` dice al frontend
        *perché* il feed è vuoto, così può spiegarlo invece di mostrare
        qualcos'altro al posto della home.
        """
        cookie_path = self.get_cookie_path()
        if not cookie_path:
            return {"results": [], "total": 0, "has_more": False, "reason": "no-cookies"}
        if not self.get_cookie_status().get("logged_in"):
            return {"results": [], "total": 0, "has_more": False, "reason": "not-logged-in"}

        # "https://www.youtube.com/" da loggati è un redirect verso questa
        # stessa URL: in modalità extract_flat yt-dlp non lo segue da solo e
        # ritorna solo il riferimento al redirect, senza video.
        page = await self._lazy_page(
            "home", "https://www.youtube.com/feed/recommended", offset, limit,
            {**ydl_opts_base_fn(), "cookiefile": cookie_path}, FEED_CHUNK, FEED_MAX,
        )
        if not page["total"]:
            # Cookie presenti e in apparenza validi, ma YouTube non ha dato
            # nulla: di solito la sessione è scaduta e va reimportata.
            page["reason"] = "feed-vuoto"
        return page

    async def get_related_page(self, video_id: str, offset: int, limit: int, ydl_opts_base_fn) -> dict:
        """
        Una pagina di video correlati, presi dal "Mix" di YouTube (playlist
        RD<id>): è la lista che YouTube stessa costruisce a partire da un
        video, e si estende con continuazioni praticamente senza fine — quindi
        regge lo scroll infinito, al contrario di una ricerca per titolo.

        Non richiede i cookie; se ci sono, il mix risulta personalizzato.
        """
        opts = {**ydl_opts_base_fn()}
        cookie_path = self.get_cookie_path()
        if cookie_path:
            opts["cookiefile"] = cookie_path
        url = f"https://www.youtube.com/watch?v={video_id}&list=RD{video_id}"
        page = await self._lazy_page(
            f"related:{video_id}", url, offset, limit, opts, RELATED_CHUNK, RELATED_MAX,
        )
        # Il primo elemento del mix è il video di partenza: fuori posto in una
        # lista di "correlati".
        page["results"] = [v for v in page["results"] if v.get("id") != video_id]
        return page

    # ── Feed Iscrizioni ────────────────────────────────────────────────────

    async def get_personalized_feed(self, ydl_opts_base_fn) -> list:
        """
        Feed 'Iscrizioni': cookie → feed reale di YouTube (ordine loro),
        tenuto in cache in memoria per qualche minuto così "carica altri" non
        ri-scarica tutto da YouTube ad ogni pagina; altrimenti la cache su
        disco aggiornata in background da tutti i canali iscritti (vedi
        refresh_subscriptions_feed), o un fetch a caldo ridotto se la cache è
        ancora vuota (es. subito dopo il primo login).
        """
        cookie_path = self.get_cookie_path()

        if cookie_path:
            if self._cookie_feed_cache and time.time() - self._cookie_feed_cache_at < COOKIE_FEED_CACHE_TTL:
                return self._cookie_feed_cache
            try:
                import yt_dlp
                opts = {
                    **ydl_opts_base_fn(),
                    "cookiefile": cookie_path,
                    "playlistend": 100,
                }
                with yt_dlp.YoutubeDL(opts) as ydl:
                    info = ydl.extract_info("https://www.youtube.com/feed/subscriptions", download=False)
                    entries = (info or {}).get("entries", [])
                    results = []
                    for e in (entries or []):
                        if not is_video_entry(e):
                            continue
                        results.append({
                            "id": e.get("id"),
                            "title": e.get("title"),
                            "channel": e.get("uploader") or e.get("channel"),
                            "channel_id": e.get("channel_id"),
                            "duration": e.get("duration"),
                            "views": e.get("view_count"),
                            "thumbnail": f"https://i.ytimg.com/vi/{e.get('id')}/hqdefault.jpg",
                            "published": _timestamp_to_upload_date(e.get("timestamp")),
                        })
                    if results:
                        self._cookie_feed_cache = results
                        self._cookie_feed_cache_at = time.time()
                        return results
            except Exception as e:
                print(f"[auth] Cookie feed error: {e}")
                if self._cookie_feed_cache:
                    return self._cookie_feed_cache  # stale, ma meglio di niente

        if self._subs_feed_cache:
            return self._subs_feed_cache

        if self._subs:
            # Cache ancora vuota (es. server appena avviato, sync in background
            # non ancora completato): fetch a caldo ma ridotto per non far
            # aspettare troppo l'utente. Il prossimo sync orario coprirà tutti i canali.
            return await self.refresh_subscriptions_feed(ydl_opts_base_fn, max_channels=15)

        return []

    async def _fetch_channel_latest(self, ch: dict, ydl_opts_base_fn, sem: asyncio.Semaphore) -> list:
        """Ultimi video di UN canale iscritto, con logo già allegato (gratis, viene da sync_subscriptions)."""
        import yt_dlp
        if not ch.get("id"):
            return []
        async with sem:
            try:
                opts = {**ydl_opts_base_fn(), "playlistend": 8}
                loop = asyncio.get_event_loop()

                def _extract():
                    with yt_dlp.YoutubeDL(opts) as ydl:
                        return ydl.extract_info(f"https://www.youtube.com/channel/{ch['id']}/videos", download=False)

                info = await loop.run_in_executor(None, _extract)
                out = []
                for e in (info or {}).get("entries", []) or []:
                    if not is_video_entry(e):
                        continue
                    out.append({
                        "id": e.get("id"),
                        "title": e.get("title"),
                        "channel": ch["name"],
                        "channel_id": ch["id"],
                        "avatar": ch.get("thumbnail"),
                        "duration": e.get("duration"),
                        "views": e.get("view_count"),
                        "thumbnail": f"https://i.ytimg.com/vi/{e.get('id')}/hqdefault.jpg",
                        "published": _timestamp_to_upload_date(e.get("timestamp")),
                    })
                return out
            except Exception:
                return []

    async def refresh_subscriptions_feed(self, ydl_opts_base_fn, max_channels: Optional[int] = None) -> list:
        """
        Scarica gli ultimi video di TUTTI i canali iscritti in parallelo
        (bounded a 10 richieste contemporanee) e li mette in cache ordinati
        per data. Chiamata ogni ora da sync.py — una scansione sincrona di
        100+ canali ad ogni caricamento della pagina sarebbe troppo lenta.
        """
        channels = self._subs if max_channels is None else self._subs[:max_channels]
        sem = asyncio.Semaphore(10)
        results_lists = await asyncio.gather(*[
            self._fetch_channel_latest(ch, ydl_opts_base_fn, sem) for ch in channels
        ])
        results = [v for sub in results_lists for v in sub]
        results.sort(key=lambda x: x.get("published") or "0", reverse=True)

        if max_channels is None:
            # Solo la scansione completa (background) aggiorna la cache persistente:
            # un fetch parziale a caldo non deve sovrascriverla con dati incompleti.
            self._subs_feed_cache = results[:300]
            self._save_subs_feed_cache()

        return results[:300]

    # ── Loghi canale (batch) ──────────────────────────────────────────────────

    async def get_channel_avatars(self, channel_ids: list) -> dict:
        """
        {channel_id: avatar_url} per una lista di canali. yt-dlp in modalità
        flat (ricerca/liste) non include il logo del canale — va richiesto a
        parte. Usa la YouTube Data API (fino a 50 id per richiesta, serve un
        account collegato) con cache persistente su disco: i loghi non cambiano
        quasi mai, quindi una volta risolti non li richiediamo più.
        """
        ids = list(dict.fromkeys(c for c in channel_ids if c))  # dedup, ordine preservato
        result = {cid: self._avatar_cache[cid] for cid in ids if cid in self._avatar_cache}
        missing = [cid for cid in ids if cid not in self._avatar_cache]
        if not missing:
            return result

        token = await self.get_valid_token()
        if not token:
            return result  # senza account collegato: solo quello che è già in cache

        try:
            async with httpx.AsyncClient() as client:
                for i in range(0, len(missing), 50):
                    batch = missing[i:i + 50]
                    r = await client.get(
                        f"{YT_API_BASE}/channels",
                        params={"part": "snippet", "id": ",".join(batch), "maxResults": 50},
                        headers={"Authorization": f"Bearer {token}"},
                        timeout=15,
                    )
                    data = r.json()
                    for item in data.get("items", []):
                        url = item.get("snippet", {}).get("thumbnails", {}).get("default", {}).get("url")
                        if url:
                            self._avatar_cache[item["id"]] = url
                            result[item["id"]] = url
            self._save_avatar_cache()
        except Exception as e:
            print(f"[auth] Channel avatars error: {e}")

        return result


# Singleton
auth_manager = AuthManager()
