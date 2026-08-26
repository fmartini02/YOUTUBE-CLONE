"""
lazy_feed.py — Estrazione pigra di un feed YouTube, a blocchi.
"""
import itertools
import time
from typing import Optional

from auth.config import FEED_REFILL_MAX
from auth.cookie_session import crea_ydl, persist_cookies
from auth.mapping import is_video_entry, map_video_entry


class LazyFeed:
    """
    Estrazione pigra di un feed YouTube, a blocchi.

    yt-dlp scarica il feed una "pagina di continuazione" alla volta (~30 video
    per richiesta HTTP) e restituisce un generatore. Consumandolo tutto subito
    si pagano decine di richieste in una raffica; tenendolo invece vivo fra una
    chiamata e l'altra si scarica solo quello che serve, quando serve — cioè
    man mano che l'utente scorre.

    Attenzione: il generatore è codice bloccante e non è thread-safe, quindi
    extend() va chiamato da un solo thread alla volta (vedi il lock in
    feed_pager.lazy_page).

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
        # il punto — non conta verso la pagina richiesta.
        self._visti: set = set()
        if escludi:
            self._visti.add(escludi)
        self._visti_all_ultima_riapertura = 0
        self.items: list = []
        self.exhausted = False
        self.created_at = time.time()
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
        close() e la sua sessione HTTP resterebbe aperta per sempre.
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
        # a YouTube per l'intestazione della pagina canale.
        self.info = {k: v for k, v in (info or {}).items() if k != "entries"}
        persist_cookies(self._ydl)

    def _rigenera(self) -> bool:
        """
        Riapre il feed daccapo per continuare oltre la fine del generatore.
        True se c'è una nuova estrazione da consumare.

        YouTube smette di dare continuazioni sulla home molto presto — misurato:
        ~200-350 video — ma NON perché abbia finito le raccomandazioni: una
        nuova estrazione riparte con una lista in buona parte diversa
        (misurato: ~100 video mai visti su ~280). Le voci già servite vengono
        saltate grazie a `_visti`, altrimenti la seconda estrazione
        ripeterebbe quasi tutta la prima e lo scroll sembrerebbe fermo.

        Due freni, perché ogni riapertura è un'estrazione intera: un tetto al
        numero di riaperture, e lo stop automatico quando l'ultima non ha
        portato niente di nuovo.
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

    def extend(self, count: int) -> int:
        """Tira fuori altri `count` video dal generatore. Ritorna quanti ne ha aggiunti."""
        added = 0
        # Le voci scartate (Mix/playlist, e i doppioni dopo una riapertura) non
        # contano verso il totale richiesto, altrimenti un blocco pieno di Mix
        # restituirebbe una pagina mezza vuota.
        while added < count and not self.exhausted:
            batch = list(itertools.islice(self._iter, count - added))
            if not batch:
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
        persist_cookies(self._ydl)
        return added

    def close(self):
        try:
            self._ydl.close()
        except Exception:
            pass
