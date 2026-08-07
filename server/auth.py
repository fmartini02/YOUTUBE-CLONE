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
# Quante volte riaprire la home quando YouTube smette di dare continuazioni
# (vedi LazyFeed._rigenera). Ogni riapertura è un'estrazione intera e rende
# sempre meno video nuovi, quindi il numero è basso di proposito: si ferma da
# sola anche prima, appena una riapertura non porta nulla di nuovo.
FEED_REFILL_MAX = 5
RELATED_CHUNK = 25             # il mix di YouTube arriva a blocchi di ~25
RELATED_MAX = 2000             # nessuno scorre così tanto la sidebar dei correlati
# Il ripiego a ricerca non ha continuazioni infinite come il Mix: oltre questo
# numero YouTube smette comunque di dare risultati pertinenti.
RELATED_SEARCH_MAX = 60
CHANNEL_CHUNK = 30             # la scheda "Video" di un canale pagina a ~30
CHANNEL_MAX = 600              # 600 video sono già anni di caricamenti per un canale
# Ogni feed aperto tiene viva un'istanza di yt-dlp: la home più i mix degli
# ultimi video guardati bastano, gli altri si chiudono.
MAX_OPEN_FEEDS = 6

# youtube.readonly basta per leggere iscrizioni e loghi, ma NON per scrivere:
# per pubblicare un commento o iscriversi a un canale Google pretende
# youtube.force-ssl (che include anche tutta la lettura). Chi si era collegato
# con il vecchio scope ha un refresh token che non lo comprende: il token
# continua a funzionare per leggere le iscrizioni, ma commentThreads.insert e
# subscriptions.insert rispondono 403 insufficientPermissions finché non rifà
# il login (vedi can_write / WRITE_SCOPE).
WRITE_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl"
OAUTH_SCOPES = f"https://www.googleapis.com/auth/youtube.readonly {WRITE_SCOPE}"
OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"
# Device flow ("TV e dispositivi con input limitato"): il server chiede un
# codice, l'utente lo digita su google.com/device da un qualsiasi telefono o
# PC, il server intanto fa polling. Non esiste redirect_uri, quindi funziona
# identico se il server sta su localhost, su un IP di LAN o su un Raspberry
# headless — al contrario del flow web, il cui redirect può puntare solo a
# localhost (Google rifiuta gli IP privati) e quindi si rompe appena il server
# non gira sulla stessa macchina del browser.
OAUTH_DEVICE_URL = "https://oauth2.googleapis.com/device/code"
DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code"
YT_API_BASE = "https://www.googleapis.com/youtube/v3"


# Per quanto ricordare che un canale non ha dato un logo (cache negativa in
# get_channel_avatars). Un giorno: abbastanza da non ripetere la richiesta ad
# ogni pagina, poco abbastanza da riprovare se il canale torna disponibile.
AVATAR_MISS_TTL = 86400

# Quanti video tenere nella cronologia. È il taglio applicato sia in memoria
# sia sul file, sulla lista ordinata dal più recente al più vecchio.
HISTORY_MAX = 500


def _scrivi_json(path: Path, data):
    """
    Salva un JSON senza poter lasciare il file a metà.

    Tutto lo stato del server sta in questi file e vengono riscritti interi ad
    ogni modifica: con una `write_text` diretta basta un kill (o un riavvio del
    Raspberry) durante la scrittura per lasciare un JSON troncato, che al
    riavvio successivo faceva esplodere `_load_all` — e siccome AuthManager è
    un singleton costruito all'import, il server non partiva più.

    Si scrive quindi su un temporaneo nella stessa cartella e lo si sposta con
    os.replace, che è atomico: il file finale o è quello vecchio o è quello
    nuovo, mai una via di mezzo.
    """
    tmp = path.with_name(path.name + ".tmp")
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    except Exception as e:
        print(f"[auth] Impossibile salvare {path.name}: {e}")
        try:
            tmp.unlink()
        except OSError:
            pass


def _leggi_json(path: Path, default):
    """
    Carica un JSON, tornando al valore predefinito se manca o è illeggibile.

    Un file corrotto (vedi _scrivi_json) non deve impedire l'avvio: perdere la
    cronologia o la cache dei loghi è molto meno grave di un server che non
    parte. Il file rotto viene messo da parte con estensione .corrotto, così
    resta recuperabile a mano e non viene riletto ad ogni riavvio.
    """
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text())
    except Exception as e:
        print(f"[auth] {path.name} illeggibile ({e}): lo metto da parte come "
              f"{path.name}.corrotto e riparto da zero.")
        try:
            os.replace(path, path.with_name(path.name + ".corrotto"))
        except OSError:
            pass
        return default


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


# Cookie che distinguono una sessione YouTube vera da un profilo solo-Google.
# Contano unicamente sul dominio youtube.com: gli stessi nomi su google.com
# ci sono anche in un profilo che su YouTube non ha mai messo piede, e per
# YouTube quel profilo è anonimo.
AUTH_COOKIE_NAMES = {"SID", "__Secure-1PSID", "LOGIN_INFO", "SAPISID"}


def youtube_auth_cookies(names_by_domain) -> set:
    """Quali cookie di autenticazione YouTube (prima parte) sono presenti."""
    return {
        name for domain, name in names_by_domain
        if domain.endswith("youtube.com") and name in AUTH_COOKIE_NAMES
    }


_logout_segnalato = False


def segnala_logout_youtube(segnala: bool = True):
    """Avvisa una volta sola che la sessione è caduta; `False` riarma l'avviso."""
    global _logout_segnalato
    if not segnala:
        _logout_segnalato = False
        return
    if _logout_segnalato:
        return
    _logout_segnalato = True
    print("[auth] YouTube ha invalidato la sessione: cookies.txt lasciato "
          "intatto. Reimporta i cookie dalle Impostazioni.")


def crea_ydl(opts: dict):
    """
    Istanza yt-dlp che non può scrivere un logout su cookies.txt.

    **Va usata al posto di `yt_dlp.YoutubeDL(...)` ovunque nel server**, perché
    la scrittura pericolosa non è una nostra chiamata: `YoutubeDL.close()`
    chiama sempre `save_cookies()`, quindi ogni estrazione riversa sul file il
    proprio jar quando finisce — anche un jar appena rimasto senza sessione.

    E succede: quando YouTube decide di invalidare la sessione manda dei
    Set-Cookie che scadono i cookie di autenticazione, yt-dlp li toglie dal jar
    e alla chiusura li cancella dal file. Da lì in poi cookies.txt è anonimo per
    sempre: reimportarlo lo ripara per qualche richiesta, poi succede di nuovo.
    Lo stesso vale per due estrazioni in parallelo, dove l'ultima che chiude
    sovrascrive i cookie ruotati dall'altra.

    Qui il controllo sta sul cookie jar, cioè sotto ogni possibile salvataggio:
    se l'autenticazione è sparita dal jar il file resta com'è, perché quei
    cookie sono l'unica copia che abbiamo. Finché invece la sessione è viva si
    salva normalmente — è necessario, YouTube ruota i cookie ad ogni richiesta
    e si aspetta che il client usi i nuovi.
    """
    import yt_dlp
    ydl = yt_dlp.YoutubeDL(opts)
    if not opts.get("cookiefile"):
        return ydl

    jar = ydl.cookiejar
    salva_davvero = jar.save

    def save(*args, **kwargs):
        if not youtube_auth_cookies((c.domain, c.name) for c in jar):
            segnala_logout_youtube()
            return
        salva_davvero(*args, **kwargs)

    jar.save = save
    return ydl


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


def channel_meta(info: dict, channel_id: str) -> dict:
    """
    Intestazione della pagina canale, dai metadati della scheda "Video".

    Le miniature di un canale sono due cose diverse nella stessa lista: il logo
    è quadrato, la copertina è molto più larga che alta. Distinguerle per
    proporzione è l'unico modo affidabile — yt-dlp non le etichetta tutte.
    """
    thumbs = [t for t in (info.get("thumbnails") or []) if t.get("url")]

    def _piu_grande(scelte):
        return max(scelte, key=lambda t: t.get("width") or 0)["url"] if scelte else None

    quadrate = [t for t in thumbs if t.get("width") and t.get("height")
                and 0.9 <= t["width"] / t["height"] <= 1.1]
    larghe = [t for t in thumbs if t.get("width") and t.get("height")
              and t["width"] / t["height"] >= 3]

    return {
        "id": info.get("channel_id") or channel_id,
        "name": info.get("channel") or info.get("uploader"),
        "handle": info.get("uploader_id"),
        "avatar": _piu_grande(quadrate),
        "banner": _piu_grande(larghe),
        "subscribers": info.get("channel_follower_count"),
        "description": info.get("description"),
        "verified": bool(info.get("channel_is_verified")),
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

    Con `refill=True` il feed non finisce quando finisce il generatore: viene
    riaperto daccapo (vedi _rigenera). Serve alla home, dove YouTube chiude le
    continuazioni molto prima di aver finito le raccomandazioni.

    `escludi` è un id da non far entrare nella lista: serve ai correlati, dove
    il primo elemento del Mix è il video che si sta guardando.
    """

    def __init__(self, url: str, opts: dict, refill: bool = False,
                 escludi: Optional[str] = None):
        self.url = url
        self._opts = opts
        self._refill = refill
        self._riaperture = 0
        # Gli id già serviti: senza, una riapertura ripeterebbe la maggior
        # parte del feed precedente (vedi _rigenera). Ci si mette dentro anche
        # l'id da escludere, così viene scartato come un doppione e — questo è
        # il punto — non conta verso la pagina richiesta: filtrarlo dopo
        # l'impaginazione faceva tornare una pagina di 24 elementi su 25.
        self._visti: set = set()
        if escludi:
            self._visti.add(escludi)
        self._visti_all_ultima_riapertura = 0
        self.items: list = []
        self.exhausted = False
        self.created_at = time.time()
        self._logout_segnalato = False
        self._ydl = None
        self._apri()

    def _apri(self):
        """
        Apre (o riapre) l'estrazione: una richiesta a YouTube, poi il generatore.

        `crea_ydl` e non `yt_dlp.YoutubeDL` — vale anche per le riaperture: ogni
        istanza chiude il proprio jar e riscriverebbe `cookies.txt`, quindi una
        sessione invalidata da YouTube durante lo scroll diventerebbe un logout
        permanente sul file.

        Se l'estrazione fallisce l'istanza va chiusa qui: l'eccezione esce dal
        costruttore, quindi nessuno riceve mai l'oggetto su cui chiamare
        close() e la sua sessione HTTP resterebbe aperta per sempre. Con un
        canale inesistente aperto qualche volta è una perdita silenziosa di
        socket e memoria.
        """
        ydl = crea_ydl(self._opts)
        try:
            # process=False evita che yt-dlp materializzi l'intera lista: è ciò
            # che mantiene pigro il generatore.
            info = ydl.extract_info(self.url, download=False, process=False)
        except Exception:
            try:
                ydl.close()
            except Exception:
                pass
            raise
        self._ydl = ydl
        self._iter = iter((info or {}).get("entries") or [])
        # Metadati della lista (nome canale, iscritti, loghi...): arrivano già
        # con questa estrazione, quindi conservarli evita una seconda richiesta
        # a YouTube per l'intestazione della pagina canale. Senza "entries",
        # che è il generatore consumato pigramente qui sopra.
        self.info = {k: v for k, v in (info or {}).items() if k != "entries"}
        self._persist_cookies()

    def _rigenera(self) -> bool:
        """
        Riapre il feed daccapo per continuare oltre la fine del generatore.
        True se c'è una nuova estrazione da consumare.

        YouTube smette di dare continuazioni sulla home molto presto — misurato:
        ~200-350 video, cioè meno di mezz'ora di scorrimento — ma NON perché
        abbia finito le raccomandazioni: una nuova estrazione riparte con una
        lista in buona parte diversa (misurato: ~100 video mai visti su ~280).
        È lo stesso comportamento della home nel browser, che a un certo punto
        si aggiorna con altri consigli. Le voci già servite vengono saltate
        grazie a `_visti`, altrimenti la seconda estrazione ripeterebbe quasi
        tutta la prima e lo scroll sembrerebbe fermo.

        Due freni, perché ogni riapertura è un'estrazione intera (decine di
        richieste a YouTube): un tetto al numero di riaperture, e lo stop
        automatico quando l'ultima non ha portato niente di nuovo — segno che
        YouTube sta ridando la stessa lista e insistere è solo traffico.
        """
        if not self._refill or self._riaperture >= FEED_REFILL_MAX:
            return False
        if self._riaperture and len(self._visti) == self._visti_all_ultima_riapertura:
            return False
        self._riaperture += 1
        self._visti_all_ultima_riapertura = len(self._visti)
        self.close()
        try:
            self._apri()
        except Exception as e:
            print(f"[auth] Riapertura feed {self.url} fallita: {e}")
            return False
        return True

    def _persist_cookies(self):
        """
        Riscrive su disco i cookie aggiornati da YouTube, ad ogni blocco.

        Ad ogni richiesta YouTube ruota alcuni cookie di sessione (SIDCC e
        simili) e si aspetta che il client usi i nuovi. yt-dlp lo fa in memoria
        e li salva sul file solo alla chiusura dell'istanza: siccome qui
        l'istanza resta viva a lungo, senza questa chiamata continueremmo a
        ripartire da cookie ormai vecchi — ed è così che la sessione viene
        invalidata da YouTube.

        Scrivere il logout deciso da YouTube invece non è possibile: ci pensa il
        jar protetto di `crea_ydl`.
        """
        try:
            self._ydl.save_cookies()
        except Exception as e:
            print(f"[auth] Impossibile salvare i cookie aggiornati: {e}")

    def extend(self, count: int) -> int:
        """Tira fuori altri `count` video dal generatore. Ritorna quanti ne ha aggiunti."""
        import itertools
        added = 0
        # Le voci scartate (Mix/playlist, e i doppioni dopo una riapertura) non
        # contano verso il totale richiesto, altrimenti un blocco pieno di Mix
        # restituirebbe una pagina mezza vuota.
        while added < count and not self.exhausted:
            batch = list(itertools.islice(self._iter, count - added))
            if not batch:
                # Generatore finito: o si riapre il feed, o il feed è finito
                # davvero (vedi _rigenera).
                if self._rigenera():
                    continue
                self.exhausted = True
                break
            for e in batch:
                if is_video_entry(e) and e["id"] not in self._visti:
                    self._visti.add(e["id"])
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
        self._token = _leggi_json(TOKEN_FILE, {})
        self._subs = _leggi_json(SUBS_FILE, [])
        self._prefs = _leggi_json(PREFS_FILE, {})
        self._history = _leggi_json(HISTORY_FILE, [])
        self._avatar_cache = _leggi_json(AVATAR_CACHE_FILE, {})
        self._subs_feed_cache = _leggi_json(SUBS_FEED_CACHE_FILE, [])

    def _save_token(self):
        _scrivi_json(TOKEN_FILE, self._token)

    def _save_subs(self):
        _scrivi_json(SUBS_FILE, self._subs)

    def _save_prefs(self):
        _scrivi_json(PREFS_FILE, self._prefs)

    def _save_history(self):
        # La cronologia è ordinata dal più recente al più vecchio (add_to_history
        # inserisce in testa), quindi si tengono i PRIMI 500: con [-500:] oltre
        # quota si buttava via il video appena guardato e si conservavano i più
        # vecchi.
        _scrivi_json(HISTORY_FILE, self._history[:HISTORY_MAX])

    def _save_avatar_cache(self):
        _scrivi_json(AVATAR_CACHE_FILE, self._avatar_cache)

    def _save_subs_feed_cache(self):
        _scrivi_json(SUBS_FEED_CACHE_FILE, self._subs_feed_cache)

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
            return self._store_token(data, client_id, client_secret)

    def _store_token(self, data: dict, client_id: str, client_secret: str) -> dict:
        """Salva su disco il token appena ottenuto (da code o da device flow)."""
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
        # Senza account collegato i loghi non si possono chiedere affatto: i
        # "questo canale non ha logo" accumulati prima non valgono più niente.
        self.dimentica_avatar_mancanti()
        return self._token

    async def start_device_flow(self, client_id: str) -> dict:
        """Device flow, passo 1: chiede a Google il codice da mostrare all'utente."""
        async with httpx.AsyncClient() as client:
            r = await client.post(OAUTH_DEVICE_URL, data={
                "client_id": client_id,
                "scope": OAUTH_SCOPES,
            })
            data = r.json()
            if "error" in data:
                raise ValueError(data.get("error_description", data["error"]))
            return data

    async def poll_device_token(self, device_code: str, client_id: str, client_secret: str) -> dict:
        """Device flow, passo 2: chiede se l'utente ha già autorizzato.

        Finché non lo fa Google risponde con un errore che non è un guasto
        (`authorization_pending`, `slow_down`): lo giriamo al chiamante come
        stato, non come eccezione.
        """
        async with httpx.AsyncClient() as client:
            r = await client.post(OAUTH_TOKEN_URL, data={
                "client_id": client_id,
                "client_secret": client_secret,
                "device_code": device_code,
                "grant_type": DEVICE_GRANT_TYPE,
            })
            data = r.json()
            err = data.get("error")
            if err in ("authorization_pending", "slow_down"):
                return {"status": err}
            if err:
                return {"status": "error", "message": data.get("error_description", err)}
            self._store_token(data, client_id, client_secret)
            return {"status": "ok"}

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

    def can_write(self) -> bool:
        """
        True solo se il token collegato comprende lo scope di scrittura, che
        serve sia per pubblicare commenti sia per iscriversi a un canale.
        Un account collegato prima che esistessero queste funzioni è
        autenticato ma può solo leggere: serve rifare il login.

        Un solo metodo per entrambe le azioni perché lo scope è lo stesso
        (`youtube.force-ssl`): due nomi diversi suggerirebbero due permessi
        distinti che YouTube non distingue.
        """
        return self.is_authenticated() and WRITE_SCOPE in (self._token.get("scope") or "")

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
        # Le cancellazioni (subscriptions.delete) rispondono 204 senza corpo:
        # non c'è JSON da leggere e non è un errore. Un corpo vuoto con stato
        # di errore invece esiste, e va distinto: trattarlo come successo
        # farebbe sparire il canale dalla lista senza averlo disiscritto.
        if r.status_code == 204 or not r.content:
            if r.is_success:
                return {}
            raise YouTubeAPIError(f"Errore YouTube ({r.status_code})", "", r.status_code)
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
        """
        Scarica tutte le iscrizioni dal canale Google dell'utente.

        La copia locale viene sostituita solo se la scansione arriva in fondo:
        una lista parziale non è "meglio di niente", è una perdita di dati.
        Le iscrizioni si leggono 50 per pagina, quindi con 120 canali un errore
        alla terza pagina (quota finita, token appena revocato, rete che cade)
        cancellava dal file i canali delle pagine mancanti — e quei canali
        sparivano dalla sidebar e dal feed iscrizioni fino alla sync successiva
        andata a buon fine.
        """
        token = await self.get_valid_token()
        if not token:
            return self._subs  # fallback cache

        subs = []
        next_page = None
        completa = False

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

                try:
                    r = await client.get(
                        f"{YT_API_BASE}/subscriptions",
                        params=params,
                        headers={"Authorization": f"Bearer {token}"},
                        timeout=15,
                    )
                    data = r.json()
                except Exception as e:
                    print(f"[auth] Sync iscrizioni interrotta: {e}")
                    break

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
                    # Ultima pagina: solo qui la lista è completa.
                    completa = True
                    break

        if not completa:
            print(f"[auth] Iscrizioni incomplete ({len(subs)} lette): "
                  f"tengo la copia locale ({len(self._subs)} canali).")
            return self._subs

        # Una lista completa e vuota è legittima (account senza iscrizioni):
        # a quel punto svuotare la copia locale è la cosa giusta.
        self._subs = subs
        self._save_subs()
        return self._subs

    def get_subscriptions(self) -> list:
        return self._subs

    # ── Iscriversi / disiscriversi (Data API, scope di scrittura) ─────────────
    #
    # Iscrizione e cancellazione costano 50 unità di quota ciascuna (su
    # 10.000/giorno): sono azioni volute dall'utente, non automatismi, quindi
    # il costo è accettabile — ma è il motivo per cui lo stato "sono iscritto?"
    # si legge dalla copia locale (subscriptions.json) e non chiedendolo a
    # YouTube ad ogni pagina canale aperta.

    def is_subscribed(self, channel_id: str) -> bool:
        """Dalla copia locale delle iscrizioni, quella che alimenta tutta la UI."""
        return any(s.get("id") == channel_id for s in self._subs)

    def _scade_feed_cookie(self):
        """
        Fa scadere la cache in memoria del feed iscrizioni letto dai cookie.

        Quel feed lo calcola YouTube, quindi la copia locale non lo tocca: senza
        scaderla, per un massimo di COOKIE_FEED_CACHE_TTL (5 minuti) le
        Iscrizioni continuerebbero a mostrare i video di un canale appena
        lasciato — o a non mostrare quelli di uno appena aggiunto.
        """
        self._cookie_feed_cache = []
        self._cookie_feed_cache_at = 0

    def _remember_sub(self, entry: dict):
        """Aggiunge (o aggiorna) un canale nella copia locale, in ordine alfabetico come la sync."""
        self._subs = [s for s in self._subs if s.get("id") != entry["id"]]
        self._subs.append(entry)
        self._subs.sort(key=lambda s: (s.get("name") or "").casefold())
        self._save_subs()
        self._scade_feed_cookie()

    def _forget_sub(self, channel_id: str) -> bool:
        """Toglie il canale dalla copia locale e dalla cache del feed iscrizioni."""
        before = len(self._subs)
        self._subs = [s for s in self._subs if s.get("id") != channel_id]
        removed = len(self._subs) != before
        if removed:
            self._save_subs()
        # Senza questo il feed continuerebbe a mostrare i video del canale
        # appena abbandonato fino alla ricostruzione oraria della cache.
        feed = [v for v in self._subs_feed_cache if v.get("channel_id") != channel_id]
        if len(feed) != len(self._subs_feed_cache):
            self._subs_feed_cache = feed
            self._save_subs_feed_cache()
        self._scade_feed_cookie()
        return removed

    async def subscribe(self, channel_id: str, name: str = "", thumbnail: str = "") -> dict:
        """
        Iscrive l'account collegato al canale e aggiorna la copia locale.

        `name`/`thumbnail` sono quelli che il frontend ha già sotto gli occhi:
        servono solo quando YouTube risponde 'sei già iscritto' (nessuno
        snippet nella risposta) e il canale manca dalla copia locale perché
        l'iscrizione è stata fatta altrove dopo l'ultima sincronizzazione.
        """
        snippet = {}
        try:
            data = await self._yt_api("POST", "subscriptions", params={"part": "snippet"}, json_body={
                "snippet": {"resourceId": {"kind": "youtube#channel", "channelId": channel_id}},
            })
            snippet = data.get("snippet") or {}
        except YouTubeAPIError as e:
            # Già iscritto: non è un errore da mostrare, l'esito voluto c'è già.
            if e.reason != "subscriptionDuplicate":
                raise
        esistente = next((s for s in self._subs if s.get("id") == channel_id), {})
        entry = {
            "id": channel_id,
            "name": snippet.get("title") or esistente.get("name") or name or channel_id,
            "thumbnail": (snippet.get("thumbnails", {}).get("default") or {}).get("url")
                         or esistente.get("thumbnail") or thumbnail or None,
            "description": (snippet.get("description") or esistente.get("description") or "")[:100],
        }
        self._remember_sub(entry)
        return entry

    async def unsubscribe(self, channel_id: str) -> bool:
        """
        Disiscrive l'account dal canale. True se YouTube aveva davvero
        un'iscrizione da cancellare.

        L'id da cancellare è quello dell'ISCRIZIONE, non del canale, e va
        chiesto a YouTube: chiederlo ogni volta (1 unità di quota) invece di
        salvarlo nella copia locale fa funzionare il pulsante anche per le
        iscrizioni fatte altrove e mai sincronizzate qui.
        """
        data = await self._yt_api("GET", "subscriptions", params={
            "part": "id", "mine": "true", "forChannelId": channel_id, "maxResults": 1,
        })
        items = data.get("items") or []
        if items:
            await self._yt_api("DELETE", "subscriptions", params={"id": items[0]["id"]})
        # La copia locale si ripulisce comunque: se YouTube non conosceva
        # quell'iscrizione, averla in elenco qui era già un errore.
        self._forget_sub(channel_id)
        return bool(items)

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
        self.invalidate_feeds()  # prima di scrivere: vedi invalidate_feeds()
        COOKIE_FILE.write_text(content)
        segnala_logout_youtube(False)  # sessione nuova: l'avviso può tornare utile
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
    _AUTH_COOKIE_NAMES = AUTH_COOKIE_NAMES
    _CANDIDATE_BROWSERS = ("brave", "chrome", "chromium", "edge", "firefox", "vivaldi", "opera")

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

    @staticmethod
    def _youtube_auth_cookies(names_by_domain) -> set:
        """Quali cookie di autenticazione YouTube (prima parte) sono presenti."""
        return youtube_auth_cookies(names_by_domain)

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
        self.invalidate_feeds()  # prima di scrivere: vedi invalidate_feeds()
        out_jar.save(str(COOKIE_FILE), ignore_discard=True, ignore_expires=True)
        segnala_logout_youtube(False)  # sessione nuova: l'avviso può tornare utile
        return {"valid": True, "cookie_count": count, "logged_in": True}

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
        self.invalidate_feeds()

    # ── Watch history ─────────────────────────────────────────────────────────

    def add_to_history(self, video: dict):
        """Aggiunge un video in testa alla cronologia locale (più recente per primo)."""
        # Rimuovi duplicati
        self._history = [h for h in self._history if h.get("id") != video.get("id")]
        self._history.insert(0, {
            "id": video.get("id"),
            "title": video.get("title"),
            "channel": video.get("channel"),
            "channel_id": video.get("channel_id"),
            "duration": video.get("duration"),
            "thumbnail": video.get("thumbnail")
                         or f"https://i.ytimg.com/vi/{video.get('id')}/hqdefault.jpg",
            "watched_at": time.time(),
        })
        # Il taglio va fatto anche in memoria, altrimenti la lista cresce senza
        # limite per tutta la vita del processo e il file salvato non
        # corrisponde più a quello che il server ha in RAM.
        del self._history[HISTORY_MAX:]
        self._save_history()

    def get_history(self, limit: int = 50) -> list:
        return self._history[:limit]

    def remove_from_history(self, video_id: str) -> bool:
        """Toglie un singolo video dalla cronologia. False se non c'era."""
        prima = len(self._history)
        self._history = [h for h in self._history if h.get("id") != video_id]
        if len(self._history) == prima:
            return False
        self._save_history()
        return True

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

    # ── Paginazione pigra condivisa (home, correlati e canali) ───────────────

    async def _lazy_page(self, key: str, url: str, offset: int, limit: int,
                         opts: dict, chunk: int, cap: int,
                         with_info: bool = False, refill: bool = False,
                         escludi: Optional[str] = None) -> dict:
        """
        Una pagina di un feed estratto pigramente, tenendo vivo il generatore
        di yt-dlp fra una richiesta e l'altra (vedi LazyFeed).

        `key` identifica il feed da riprendere: "home" per le raccomandazioni,
        "related:<id>" per il mix di un video, "channel:<id>" per la scheda
        video di un canale. I feed aperti restano in una piccola cache LRU
        perché ognuno tiene aperta un'istanza di yt-dlp.

        Con `with_info` la risposta porta anche `info`, i metadati della lista
        (per il canale: nome, iscritti, logo). Vengono letti anche quando il
        feed è vuoto e quindi già scartato, perché servono a intestare la
        pagina pure in quel caso.

        Con `refill` il feed si riapre invece di finire (vedi LazyFeed): ha
        senso solo dove una nuova estrazione dà una lista diversa, cioè la
        home. Riaprire un canale o un Mix ridarebbe gli stessi video.
        """
        lock = self._feed_locks.setdefault(key, asyncio.Lock())
        # Un solo estrattore alla volta per feed: il generatore di yt-dlp non è
        # thread-safe e due scroll paralleli lo corromperebbero.
        try:
            async with lock:
                return await self._lazy_page_locked(
                    key, url, offset, limit, opts, chunk, cap, with_info,
                    refill, escludi)
        finally:
            # Il lock va tolto quando non serve più: `key` contiene un id di
            # video (related:<id>) o di canale, quindi senza potatura la mappa
            # cresce di una voce per ogni video di cui si sono chiesti i
            # correlati e non si svuota mai. Va fatto FUORI dal `with`, quando
            # il lock è di nuovo libero.
            self._pota_lock(key)

    async def _lazy_page_locked(self, key: str, url: str, offset: int, limit: int,
                                opts: dict, chunk: int, cap: int,
                                with_info: bool, refill: bool,
                                escludi: Optional[str]) -> dict:
        """Corpo di _lazy_page, eseguito con il lock del feed già preso."""
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
            feed = await self._open_lazy_feed(url, opts, refill, escludi)
            if feed is None:
                vuoto = {"results": [], "total": 0, "has_more": False}
                return {**vuoto, "info": {}} if with_info else vuoto
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
        # Un feed che non ha prodotto NIENTE non va tenuto in cache: è uno
        # stato di errore (sessione rifiutata, estrazione fallita, blocco
        # temporaneo di YouTube), non un risultato. Tenendolo, ogni
        # richiesta successiva rispondeva "vuoto" senza nemmeno riprovare
        # fino alla scadenza del TTL — mezz'ora in cui reimportare i cookie
        # non cambiava niente, perché il feed guasto restava lì.
        if not items:
            self._drop_feed(key)

        page = {
            "results": items[offset:offset + limit],
            "total": len(items),
            # C'è altro se il feed può ancora crescere, o se abbiamo già in
            # memoria voci oltre la pagina appena servita.
            "has_more": ((not feed.exhausted) and len(items) < cap) or offset + limit < len(items),
        }
        if with_info:
            page["info"] = feed.info
        return page

    def _drop_feed(self, key: str):
        """Chiude e dimentica un feed aperto, se c'è."""
        feed = self._feeds.pop(key, None)
        if feed is not None:
            feed.close()

    def _pota_lock(self, key: str):
        """
        Toglie il lock di un feed che non è più aperto.

        Un lock per feed serve finché il feed esiste; le chiavi però contengono
        id di video e di canale, quindi tenerli tutti significa una voce in più
        ad ogni video di cui si aprono i correlati — un dizionario che in una
        sessione lunga arriva a migliaia di lock inutili.

        Si toglie solo se è libero: `locked()` è vero anche quando qualcuno è
        in attesa, quindi un lock che serve ancora a una richiesta in corso non
        viene mai rimosso da sotto i piedi.
        """
        if key in self._feeds:
            return
        lock = self._feed_locks.get(key)
        if lock is not None and not lock.locked():
            self._feed_locks.pop(key, None)

    def invalidate_feeds(self):
        """
        Butta via tutti i feed aperti.

        Serve quando cambiano i cookie: ogni LazyFeed tiene viva un'istanza di
        yt-dlp con la sessione di PRIMA: senza questa chiamata, reimportare i
        cookie non aveva effetto sulla home finché il feed non scadeva da solo.
        I lock dei feed chiusi si possono togliere solo se liberi: quelli presi
        appartengono a richieste in corso, che li rilasceranno da sé (e la
        potatura tocca poi a `_pota_lock`, nel `finally` di `_lazy_page`).

        Chi reimporta i cookie deve chiamarla PRIMA di scrivere il file nuovo:
        chiudere un feed fa salvare a yt-dlp la sua copia dei cookie, che
        sovrascriverebbe quelli appena importati con quelli della sessione
        vecchia.
        """
        for key in list(self._feeds):
            self._drop_feed(key)
            self._pota_lock(key)

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

    async def _open_lazy_feed(self, url: str, opts: dict, refill: bool = False,
                              escludi: Optional[str] = None):
        """Apre il feed (prima richiesta a YouTube). None se fallisce."""
        try:
            # extract_info è bloccante: in un thread separato, altrimenti
            # fermerebbe l'intero event loop di FastAPI (niente riproduzione,
            # niente ricerche) per tutta la durata dell'estrazione.
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(
                None, lambda: LazyFeed(url, opts, refill, escludi))
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
        # refill: YouTube chiude le continuazioni della home dopo poche
        # centinaia di video, ma riaprendo il feed ne dà altri (vedi
        # LazyFeed._rigenera). Senza, lo scroll della home finiva lì.
        page = await self._lazy_page(
            "home", "https://www.youtube.com/feed/recommended", offset, limit,
            {**ydl_opts_base_fn(), "cookiefile": cookie_path}, FEED_CHUNK, FEED_MAX,
            refill=True,
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
        # `escludi`: il primo elemento del Mix è il video di partenza, fuori
        # posto in una lista di "correlati". Va scartato dentro il feed e non
        # sulla pagina già impaginata, altrimenti la prima pagina torna con un
        # elemento in meno di quelli chiesti.
        page = await self._lazy_page(
            f"related:{video_id}", url, offset, limit, opts, RELATED_CHUNK, RELATED_MAX,
            escludi=video_id,
        )

        # Non tutti i video hanno un Mix: YouTube non lo genera per i video
        # poco visti o dei canali piccoli, e lì yt-dlp avvisa "Unable to
        # recognize playlist" e ricade sul solo video di partenza. La sidebar
        # restava vuota senza dire perché — capita proprio sui video che si
        # aprono dalla home personalizzata.
        if not page["total"]:
            return await self._related_by_search(video_id, offset, limit, opts)

        # Dalla seconda pagina in poi il feed aperto può già essere quello del
        # ripiego: l'etichetta va letta da lì, non data per scontata.
        page["source"] = self._related_source(video_id)
        return page

    def _related_source(self, video_id: str) -> str:
        """"mix" o "ricerca", secondo il feed effettivamente aperto per questo video."""
        feed = self._feeds.get(f"related:{video_id}")
        return "ricerca" if feed is not None and feed.url.startswith("ytsearch") else "mix"

    async def _related_by_search(self, video_id: str, offset: int, limit: int, opts: dict) -> dict:
        """
        Ripiego quando il Mix non esiste: una ricerca sul titolo del video.

        Meno "personale" del Mix e non infinita, ma per un video di nicchia i
        risultati sono quasi sempre a tema — molto meglio di una colonna vuota.
        """
        title = await self._video_title(video_id, opts)
        if not title:
            return {"results": [], "total": 0, "has_more": False, "source": "nessuna"}

        # La ricerca per titolo restituisce quasi sempre il video stesso in
        # cima: come per il Mix, si esclude dentro il feed.
        page = await self._lazy_page(
            f"related:{video_id}", f"ytsearch{RELATED_SEARCH_MAX}:{title}",
            offset, limit, opts, RELATED_CHUNK, RELATED_SEARCH_MAX,
            escludi=video_id,
        )
        page["source"] = "ricerca"
        return page

    async def _video_title(self, video_id: str, opts: dict) -> Optional[str]:
        """
        Titolo di un video, al costo più basso possibile.

        process=False evita a yt-dlp di risolvere i formati di riproduzione,
        che è il pezzo lento: qui serve solo una stringa da cercare.
        """
        def _estrai():
            with crea_ydl(opts) as ydl:
                return ydl.extract_info(
                    f"https://www.youtube.com/watch?v={video_id}",
                    download=False, process=False,
                )

        try:
            loop = asyncio.get_event_loop()
            info = await loop.run_in_executor(None, _estrai)
            return (info or {}).get("title")
        except Exception as e:
            print(f"[auth] Titolo non recuperabile per {video_id}: {e}")
            return None

    # ── Pagina canale ──────────────────────────────────────────────────────

    async def get_channel_page(self, channel_id: str, offset: int, limit: int,
                               ydl_opts_base_fn) -> dict:
        """
        Una pagina della scheda "Video" di un canale, più l'intestazione.

        Stesso meccanismo pigro di home e correlati: la scheda video di un
        canale può contenere migliaia di video e scaricarla tutta per mostrarne
        i primi trenta sarebbe una raffica di richieste per niente.

        I cookie non servono (un canale è pubblico) ma se ci sono si usano lo
        stesso, altrimenti YouTube tratta la sessione come anonima e in certi
        casi chiede la verifica dell'età.
        """
        opts = {**ydl_opts_base_fn()}
        cookie_path = self.get_cookie_path()
        if cookie_path:
            opts["cookiefile"] = cookie_path

        page = await self._lazy_page(
            f"channel:{channel_id}",
            f"https://www.youtube.com/channel/{channel_id}/videos",
            offset, limit, opts, CHANNEL_CHUNK, CHANNEL_MAX, with_info=True,
        )
        info = page.pop("info", {}) or {}
        meta = channel_meta(info, channel_id)

        # Nella scheda di un canale yt-dlp non ripete l'autore su ogni voce
        # (è implicito): senza questo le card uscirebbero senza nome canale.
        for v in page["results"]:
            v["channel"] = v.get("channel") or meta["name"]
            v["channel_id"] = v.get("channel_id") or meta["id"]

        # Solo l'intestazione: lo stato dell'iscrizione il tasto se lo chiede da
        # sé con /api/subscriptions/status/<id>, che risponde dalla copia locale
        # senza interrogare YouTube. Metterlo anche qui vorrebbe dire due fonti
        # per lo stesso dato, da tenere allineate a mano.
        page["channel"] = meta
        if not page["total"]:
            # Distinguere "canale che non esiste / non raggiungibile" da
            # "canale senza video caricati": la pagina lo spiega invece di
            # restare vuota.
            page["reason"] = "canale-non-trovato" if not meta["name"] else "nessun-video"
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
                opts = {
                    **ydl_opts_base_fn(),
                    "cookiefile": cookie_path,
                    "playlistend": 100,
                }
                with crea_ydl(opts) as ydl:
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
        if not ch.get("id"):
            return []
        async with sem:
            try:
                opts = {**ydl_opts_base_fn(), "playlistend": 8}
                loop = asyncio.get_event_loop()

                def _extract():
                    with crea_ydl(opts) as ydl:
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

        Anche i canali *senza* risposta vanno ricordati (cache negativa): sono
        i canali cancellati o gli id che la API non riconosce, e senza segnarli
        finivano nella lista dei mancanti ad ogni pagina aperta — una richiesta
        e un po' di quota buttate via ogni volta, per sempre. Il segnaposto
        scade dopo AVATAR_MISS_TTL, così un canale tornato disponibile viene
        comunque ritentato, e viene ignorato del tutto se nel frattempo
        l'account è cambiato (vedi forza: i "buchi" di prima del login sono
        spiegati dal fatto che non c'era un token).
        """
        ids = list(dict.fromkeys(c for c in channel_ids if c))  # dedup, ordine preservato
        result = {}
        missing = []
        for cid in ids:
            cached = self._avatar_cache.get(cid)
            if isinstance(cached, str):
                result[cid] = cached
            elif self._miss_ancora_valido(cached):
                continue  # sappiamo già che questo canale non ha un logo
            else:
                missing.append(cid)
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
                    if "error" in data:
                        # Quota finita o token rifiutato: è un guasto
                        # temporaneo, non un canale senza logo. Segnarlo come
                        # "niente logo" lo renderebbe definitivo.
                        print(f"[auth] Channel avatars: {data['error'].get('message')}")
                        break
                    for item in data.get("items", []):
                        url = item.get("snippet", {}).get("thumbnails", {}).get("default", {}).get("url")
                        if url:
                            self._avatar_cache[item["id"]] = url
                            result[item["id"]] = url
                    # Chi non è tornato dalla API non esiste (canale cancellato
                    # o id sbagliato): ricordiamolo, con scadenza.
                    for cid in batch:
                        if cid not in result:
                            self._avatar_cache[cid] = {"miss_at": time.time()}
            self._save_avatar_cache()
        except Exception as e:
            print(f"[auth] Channel avatars error: {e}")

        return result

    @staticmethod
    def _miss_ancora_valido(cached) -> bool:
        """True se `cached` è un segnaposto 'nessun logo' non ancora scaduto."""
        if not isinstance(cached, dict):
            return False
        return time.time() - (cached.get("miss_at") or 0) < AVATAR_MISS_TTL

    def dimentica_avatar_mancanti(self):
        """
        Cancella i segnaposti "nessun logo".

        Da chiamare quando cambia l'account collegato: senza token la API non
        risponde affatto, quindi i buchi accumulati prima del login non dicono
        niente sul canale e vanno ritentati subito invece di aspettare la
        scadenza.
        """
        self._avatar_cache = {
            cid: v for cid, v in self._avatar_cache.items() if isinstance(v, str)
        }
        self._save_avatar_cache()


# Singleton
auth_manager = AuthManager()
