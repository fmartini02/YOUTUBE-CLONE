"""
cookie_session.py — sessione cookie YouTube: distinguerla da un profilo solo
Google, avvisare quando cade, e l'istanza yt-dlp che non può cancellarla.
"""
from auth.storage import COOKIE_FILE, proteggi_file

# Cookie che distinguono una sessione YouTube vera da un profilo solo-Google.
# Contano unicamente sul dominio youtube.com: gli stessi nomi su google.com
# ci sono anche in un profilo che su YouTube non ha mai messo piede, e per
# YouTube quel profilo è anonimo.
AUTH_COOKIE_NAMES = {"SID", "__Secure-1PSID", "LOGIN_INFO", "SAPISID"}

_logout_segnalato = False


def youtube_auth_cookies(names_by_domain) -> set:
    """Quali cookie di autenticazione YouTube (prima parte) sono presenti."""
    return {
        name for domain, name in names_by_domain
        if domain.endswith("youtube.com") and name in AUTH_COOKIE_NAMES
    }


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


def persist_cookies(ydl):
    """
    Riscrive su disco i cookie aggiornati da YouTube.

    Ad ogni richiesta YouTube ruota alcuni cookie di sessione (SIDCC e simili)
    e si aspetta che il client usi i nuovi. yt-dlp lo fa in memoria e li salva
    sul file solo alla chiusura dell'istanza: se un LazyFeed resta vivo a
    lungo, senza questa chiamata continuerebbe a ripartire da cookie ormai
    vecchi — ed è così che la sessione viene invalidata da YouTube.

    Scrivere il logout deciso da YouTube invece non è possibile: ci pensa il
    jar protetto di crea_ydl.
    """
    try:
        ydl.save_cookies()
    except Exception as e:
        print(f"[auth] Impossibile salvare i cookie aggiornati: {e}")


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
        # yt-dlp ricrea il file da zero ad ogni estrazione, quindi i permessi
        # vanno rimessi qui: è l'unico punto sotto cui passano tutti i salvataggi.
        proteggi_file(COOKIE_FILE)

    jar.save = save
    return ydl
