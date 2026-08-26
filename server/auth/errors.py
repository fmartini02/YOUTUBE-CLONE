"""errors.py — errore restituito dalla YouTube Data API."""


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
