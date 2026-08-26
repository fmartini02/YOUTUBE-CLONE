import { api } from "../api";

// Ottimistico: la riga sparisce subito. Se il server rifiuta si rimette a
// posto la lista rileggendola, invece di far finta di niente.
export async function rimuoviVoce(id, setVoci, addToast) {
  setVoci(v => v.filter(x => x.id !== id));
  try {
    await api.removeHistory(id);
  } catch {
    addToast("Non sono riuscito a togliere il video dalla cronologia");
    api.history().then(d => setVoci(d.history || [])).catch(() => {});
  }
}

export async function svuotaCronologia(voci, setVoci, addToast) {
  setVoci([]);
  try {
    await api.clearHistory();
    addToast("Cronologia cancellata");
  } catch {
    setVoci(voci);
    addToast("Non sono riuscito a cancellare la cronologia");
  }
}
