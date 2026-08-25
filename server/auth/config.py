"""
config.py — costanti di tuning: feed pigri, OAuth, cache dei loghi canale.
"""

# 5 minuti: evita di ri-scaricare da YouTube ad ogni "carica altri" il feed
# iscrizioni letto dai cookie.
COOKIE_FEED_CACHE_TTL = 300

# Il feed home viene estratto PIGRAMENTE, un blocco alla volta, man mano che
# l'utente scorre (vedi lazy_feed.LazyFeed): scaricarlo tutto in anticipo
# significherebbe decine di richieste consecutive a YouTube — la raffica che
# può far invalidare la sessione dei cookie — per video che magari non
# verranno mai guardati.
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
# per pubblicare un commento o iscriversi a un canale Google pretende un
# accesso completo. Sarebbe youtube.force-ssl (che include anche tutta la
# lettura), ma il device flow ("TV e dispositivi con input limitato") accetta
# solo un elenco ristretto di scope e da lì force-ssl è assente — Google lo
# rifiuta con "Invalid device flow scope" al primo passo, prima ancora che
# l'utente veda la schermata di consenso. Il device flow consente invece lo
# scope pieno "youtube" (senza force-ssl), che dà lo stesso accesso in
# scrittura. Chi si era collegato con un vecchio scope insufficiente ha un
# refresh token che non lo comprende: il token continua a funzionare per
# leggere le iscrizioni, ma commentThreads.insert e subscriptions.insert
# rispondono 403 insufficientPermissions finché non rifà il login (vedi
# oauth_status.can_write).
WRITE_SCOPE = "https://www.googleapis.com/auth/youtube"
OAUTH_SCOPES = f"https://www.googleapis.com/auth/youtube.readonly {WRITE_SCOPE}"
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
# channel_avatars.get_channel_avatars). Un giorno: abbastanza da non ripetere
# la richiesta ad ogni pagina, poco abbastanza da riprovare se il canale torna
# disponibile.
AVATAR_MISS_TTL = 86400

# Quanti video tenere nella cronologia. È il taglio applicato sia in memoria
# sia sul file, sulla lista ordinata dal più recente al più vecchio.
HISTORY_MAX = 500
