"""
ydl_finto.py — l'istanza yt-dlp che `LazyFeed` riceve da `crea_ydl`, senza
rete: `extract_info(process=False)` restituisce un generatore pigro di voci,
come quello vero, e tiene conto di quante ne sono state lette.
"""


class YdlFinto:
    def __init__(self, ids: list):
        self._ids = ids
        self.letti: list = []
        self.salvataggi = 0
        self.chiuso = False

    def _voci(self):
        for vid in self._ids:
            self.letti.append(vid)
            yield {"id": vid, "title": f"Video {vid}", "uploader": "Canale finto"}

    def extract_info(self, url, download=False, process=True):
        return {"title": "Feed finto", "entries": self._voci()}

    def save_cookies(self):
        self.salvataggi += 1

    def close(self):
        self.chiuso = True
