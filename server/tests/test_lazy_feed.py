"""
LazyFeed (auth/lazy_feed.py) con un yt-dlp finto (fixture `ydl_finto`):
paginazione pigra, voci scartate che non contano, riapertura della home che
salta gli id già serviti, e i due freni alle riaperture.
"""
from auth.config import FEED_REFILL_MAX
from auth.lazy_feed import LazyFeed


def _ids(da: int, a: int) -> list:
    return [f"vid{n:08d}" for n in range(da, a)]   # 11 caratteri, come gli id veri


def test_paginazione_pigra(ydl_finto):
    """Un Mix (id lungo) in mezzo non conta: la pagina resta piena. Si legge solo quanto serve."""
    ids = _ids(0, 10)
    create = ydl_finto([ids[:2] + ["RDmix000000000000"] + ids[2:]])
    feed = LazyFeed("https://www.youtube.com/", {})
    assert feed.extend(4) == 4
    assert [v["id"] for v in feed.items] == ids[:4]
    assert len(create[0].letti) == 5                 # 4 video + il Mix, non tutto il feed
    assert feed.extend(100) == 6 and feed.exhausted
    assert len(create) == 1 and create[0].salvataggi >= 2   # cookie salvati a ogni blocco


def test_escludi_non_conta(ydl_finto):
    """Correlati: il primo del Mix è il video aperto, e non deve togliere un posto alla pagina."""
    ydl_finto([_ids(0, 6)])
    feed = LazyFeed("https://www.youtube.com/watch?v=x&list=RDx", {}, escludi="vid00000000")
    assert feed.extend(3) == 3
    assert [v["id"] for v in feed.items] == _ids(1, 4)


def test_home_riaperta_senza_doppioni(ydl_finto):
    create = ydl_finto([_ids(0, 5), _ids(3, 8)])
    feed = LazyFeed("https://www.youtube.com/", {}, refill=True)
    assert feed.extend(8) == 8
    assert [v["id"] for v in feed.items] == _ids(0, 8)
    assert len(create) == 2 and create[0].chiuso


def test_freni_alle_riaperture(ydl_finto):
    """Ogni riapertura è un'estrazione intera: si ferma se non porta niente di nuovo, e comunque al tetto."""
    create = ydl_finto([_ids(0, 5)])                  # ogni estrazione ridà la stessa lista
    feed = LazyFeed("https://www.youtube.com/", {}, refill=True)
    assert feed.extend(100) == 5 and feed.exhausted
    assert len(create) == 2
    create = ydl_finto([_ids(n * 10, n * 10 + 10) for n in range(FEED_REFILL_MAX + 5)])
    feed = LazyFeed("https://www.youtube.com/", {}, refill=True)
    feed.extend(10_000)
    assert feed.exhausted and len(create) == 1 + FEED_REFILL_MAX
    assert len(feed.items) == 10 * (1 + FEED_REFILL_MAX)
