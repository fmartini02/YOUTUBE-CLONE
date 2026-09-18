"""
channel_bubbles.py — "bollicine" dei canali iscritti più attivi (riga di avatar
in home) e stato "canale visto".

Due regole che sembrano dettagli e non lo sono:

- Qui NON si estrae niente. I video recenti vengono solo dalle cache già in
  memoria o già su disco (feed cookie, cache del feed iscrizioni): chiamare la
  funzione che genera il feed personalizzato aprirebbe una seconda estrazione
  yt-dlp in parallelo a quella della home, e su un Raspberry si sente.
- Il "nuovo" si decide confrontando l'ID dell'ultimo video noto con quello
  marcato visto, non le date: le date del feed sono spesso approssimate al
  giorno (extractor_args approximate_date), quindi due video usciti lo stesso
  giorno risulterebbero indistinguibili.
"""
import time

from auth.storage import CHANNEL_SEEN_FILE, _scrivi_json


def _ultimo_per_canale(videos: list) -> dict:
    """{channel_id: voce del video più recente noto di quel canale}.

    Le liste in cache arrivano già ordinate dal video più recente, quindi la
    prima voce che si incontra per un canale è anche la sua più recente.
    """
    ultimi = {}
    for v in videos or []:
        cid = v.get("channel_id")
        if cid and cid not in ultimi:
            ultimi[cid] = v
    return ultimi


def _sorgente(state) -> tuple:
    """(video recenti, nome della sorgente) — solo cache, mai una nuova estrazione.

    "cookie" = feed iscrizioni reale di YouTube tenuto in memoria; "cache" = la
    scansione oraria dei canali iscritti salvata su disco; "subs" = nessun video
    noto ma l'elenco dei canali c'è (bollicine senza indicatore "nuovo");
    "nessuna" = niente cookie e niente OAuth, la home non mostrerà la riga.
    """
    if state.cookie_feed_cache:
        return state.cookie_feed_cache, "cookie"
    if state.subs_feed_cache:
        return state.subs_feed_cache, "cache"
    return [], ("subs" if state.subs else "nessuna")


def _voce(state, cid: str, video: dict, subs_idx: dict) -> dict:
    """Una bollicina: canale, logo e se ha un video non ancora visto.

    Il logo ha tre provenienze possibili perché nessuna copre tutti i casi: le
    iscrizioni via OAuth ce l'hanno, la cache del feed lo allega, il feed cookie
    no (yt-dlp in modalità flat non lo include) e lì resta la cache dei loghi.
    """
    sub = subs_idx.get(cid) or {}
    cached = state.avatar_cache.get(cid)
    latest_id = (video or {}).get("id")
    visto = (state.channel_seen.get(cid) or {}).get("video_id")
    return {
        "id": cid,
        "name": (video or {}).get("channel") or sub.get("name"),
        "avatar": (sub.get("thumbnail") or (video or {}).get("avatar")
                   or (cached if isinstance(cached, str) else None)),
        # Un canale mai marcato visto è "nuovo"; senza video noti non lo è mai.
        "nuovo": bool(latest_id) and latest_id != visto,
        "latest_id": latest_id,
    }


def get_bubbles(state, limit: int = 24) -> dict:
    """Canali iscritti ordinati per ultimo video noto (più recenti prima).

    I canali di cui non conosciamo nessun video finiscono in coda: ci sono, ma
    non hanno niente da segnalare. A parità di data (le date sono al giorno)
    vince l'ordine del feed, che è più fine — sort stabile.
    """
    videos, source = _sorgente(state)
    ultimi = _ultimo_per_canale(videos)
    subs_idx = {s.get("id"): s for s in (state.subs or []) if s.get("id")}
    ids = sorted(ultimi, key=lambda c: (ultimi[c].get("published") or ""), reverse=True)
    ids += [c for c in subs_idx if c not in ultimi]
    canali = [_voce(state, cid, ultimi.get(cid), subs_idx) for cid in ids]
    return {"channels": canali[:max(1, limit)], "source": source}


def mark_seen(state, channel_id: str, video_id: str = None) -> bool:
    """Marca il canale come visto fino al suo ultimo video noto. True se è cambiato qualcosa.

    Con `video_id` (l'utente ha aperto QUEL video) si marca solo se coincide con
    l'ultimo noto: aprire un video vecchio non deve spegnere l'indicatore di uno
    nuovo che l'utente non ha ancora guardato. Senza (bollicina toccata, pagina
    canale aperta) si marca direttamente l'ultimo noto.
    """
    if not channel_id:
        return False  # le voci di cronologia possono non avere il canale
    ultimo = (_ultimo_per_canale(_sorgente(state)[0]).get(channel_id) or {}).get("id")
    if video_id is not None and video_id != ultimo:
        return False
    if not ultimo or (state.channel_seen.get(channel_id) or {}).get("video_id") == ultimo:
        return False  # niente da marcare, o già marcato: non riscrivere il file
    state.channel_seen[channel_id] = {"video_id": ultimo, "at": int(time.time())}
    _scrivi_json(CHANNEL_SEEN_FILE, state.channel_seen)
    return True
