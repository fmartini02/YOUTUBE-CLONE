import { getServerBase } from "./base";

export async function apiFetch(path, opts = {}) {
  const res = await fetch(getServerBase() + path, opts);
  if (!res.ok) {
    const err = await res.text().catch(() => "Unknown error");
    throw new Error(err);
  }
  return res.json();
}

/**
 * apiFetch rilancia il corpo della risposta così com'è, che per FastAPI è
 * {"detail": "..."}: qui serve la sola frase, è quella che finisce nel toast.
 */
export function errorMessage(e, fallback = "") {
  const raw = String(e?.message || e || "");
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.detail) return String(parsed.detail);
  } catch { /* non era JSON: si usa il testo così com'è */ }
  return raw.slice(0, 160) || fallback;
}
