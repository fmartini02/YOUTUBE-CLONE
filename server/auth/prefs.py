"""prefs.py — preferenze utente (qualità, autoplay, tema, adatta allo schermo, SponsorBlock)."""
from auth.storage import PREFS_FILE, _scrivi_json


def get_prefs(state) -> dict:
    return {
        "quality": state.prefs.get("quality", "best"),
        "autoplay": state.prefs.get("autoplay", True),
        # "dark" | "light" | "auto": la legge usePrefs e diventa
        # l'attributo data-theme su <html>.
        "theme": state.prefs.get("theme", "dark"),
        # Con "quality" = "best", il player non chiede più della risoluzione
        # dello schermo del dispositivo. Attivo di default. Vedi
        # qualityForScreen in frontend/src/components/VideoPlayer/videoPlayerHelpers.js.
        "fitScreen": state.prefs.get("fitScreen", True),
        # SponsorBlock: attivo di default (il senso dell'app è guardare senza
        # pubblicità). Le categorie salvate sono solo quelle cambiate almeno
        # una volta: i default per categoria stanno in un posto solo,
        # frontend/src/components/VideoPlayer/sponsorBlock.js, così una
        # categoria aggiunta dopo prende il suo default anche per chi ha già
        # salvato le altre.
        "sponsorBlock": state.prefs.get("sponsorBlock", True),
        "sponsorCategories": state.prefs.get("sponsorCategories", {}),
        # Riapre i video dal punto in cui erano stati lasciati e mostra la
        # barretta rossa sulle miniature. Spenta, la posizione si registra
        # comunque (come la cronologia stessa): riaccenderla non riparte da zero.
        # Vedi auth/watch_progress.py.
        "resume": state.prefs.get("resume", True),
    }


def update_prefs(state, updates: dict) -> dict:
    state.prefs.update(updates)
    _scrivi_json(PREFS_FILE, state.prefs)
    return get_prefs(state)
