import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { api } from "../api";

/**
 * Le preferenze salvate sul server (/api/prefs), lette una volta all'avvio e
 * condivise da tutta l'app.
 *
 * Prima esistevano solo in scrittura: SettingsPage le salvava e nessuno le
 * rileggeva mai, quindi la qualità predefinita non aveva alcun effetto sul
 * player, l'autoplay non era mai consultato e il tema non esisteva proprio.
 *
 * `pronte` distingue "non ancora arrivate dal server" da "arrivate": chi le usa
 * come valore iniziale (la qualità del player) deve aspettare, altrimenti
 * partirebbe con il default e la preferenza vera arriverebbe a video già
 * avviato.
 */

const DEFAULT = { quality: "best", autoplay: true, theme: "dark", fitScreen: true };

const PrefsContext = createContext({ prefs: DEFAULT, pronte: false, salvaPrefs: async () => {} });

export function usePrefs() {
  return useContext(PrefsContext);
}

// Ottimistico: la UI si aggiorna subito, poi il server conferma con lo stato
// completo. Aspettare la risposta faceva "rimbalzare" gli interruttori delle
// impostazioni. Se il salvataggio fallisce si rilegge lo stato vero, invece
// di lasciare a video una preferenza che sul server non esiste.
async function salvaPrefsImpl(updates, setPrefs) {
  setPrefs(p => ({ ...p, ...updates }));
  try {
    const p = await api.updatePrefs(updates);
    setPrefs({ ...DEFAULT, ...p });
  } catch {
    api.prefs().then(p => setPrefs({ ...DEFAULT, ...p })).catch(() => {});
  }
}

// Il tema si applica sull'elemento <html> come attributo: il CSS ha una
// palette per ognuno (vedi App.css). "auto" non scrive niente e lascia
// decidere alla media query prefers-color-scheme.
function applyThemeAttribute(theme) {
  const root = document.documentElement;
  if (theme === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme === "light" ? "light" : "dark");
}

export function PrefsProvider({ children }) {
  const [prefs, setPrefs] = useState(DEFAULT);
  const [pronte, setPronte] = useState(false);

  useEffect(() => {
    api.prefs().then(p => setPrefs({ ...DEFAULT, ...p })).catch(() => {}).finally(() => setPronte(true));
  }, []);

  const salvaPrefs = useCallback(updates => salvaPrefsImpl(updates, setPrefs), []);

  useEffect(() => applyThemeAttribute(prefs.theme), [prefs.theme]);

  const value = useMemo(() => ({ prefs, pronte, salvaPrefs }), [prefs, pronte, salvaPrefs]);
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}
