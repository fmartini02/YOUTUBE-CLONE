"""prefs.py — preferenze utente (qualità, autoplay, tema, adatta allo schermo)."""
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
    }


def update_prefs(state, updates: dict) -> dict:
    state.prefs.update(updates)
    _scrivi_json(PREFS_FILE, state.prefs)
    return get_prefs(state)
