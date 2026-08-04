import { useState } from "react";
import { setServerBase, checkServerReachable, getServerBase } from "../api";

/**
 * Schermata di onboarding mostrata SOLO dentro l'app Android (Capacitor):
 * il frontend è impacchettato nell'apk ma il server gira sul PC dell'utente,
 * quindi va indicato un IP — non lo si può fissare a build-time perché
 * cambia da un'installazione/rete all'altra.
 */
export default function ServerSetup({ onDone }) {
  const [address, setAddress] = useState(() => (getServerBase() || "").replace(/^https?:\/\//, ""));
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  async function handleConnect() {
    const raw = address.trim();
    if (!raw) { setError("Inserisci l'indirizzo del PC"); return; }

    let url = raw;
    if (!/^https?:\/\//i.test(url)) url = "http://" + url;
    try {
      const u = new URL(url);
      if (!u.port) u.port = "8090"; // porta di default se l'utente non l'ha indicata
      url = u.toString().replace(/\/$/, "");
    } catch {
      if (!/:\d+$/.test(url)) url += ":8090";
    }

    setChecking(true);
    setError("");
    const ok = await checkServerReachable(url);
    setChecking(false);

    if (!ok) {
      setError("Impossibile raggiungere il server a questo indirizzo. Verifica che il PC sia acceso, il server avviato (start_server.sh), e che il telefono sia sulla stessa rete WiFi.");
      return;
    }
    setServerBase(url);
    onDone();
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 16,
      background: "var(--bg, #0f0f0f)", color: "var(--text, #f1f1f1)",
      padding: 24, textAlign: "center",
    }}>
      <div style={{ fontSize: 48, color: "var(--accent, #ff0000)" }}>▶</div>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>YTProxy</h1>
      <p style={{ fontSize: 14, color: "var(--text2, #aaa)", maxWidth: 340, lineHeight: 1.6, margin: 0 }}>
        Questa app si collega al server YTProxy che gira sul tuo PC. Inserisci il suo indirizzo
        — lo trovi stampato quando avvii <code>start_server.sh</code>, o con <code>hostname -I</code> sul PC.
      </p>

      <input
        value={address}
        onChange={e => setAddress(e.target.value)}
        onKeyDown={e => e.key === "Enter" && handleConnect()}
        placeholder="es. 192.168.1.11:8090"
        autoCapitalize="off"
        autoCorrect="off"
        style={{
          width: "100%", maxWidth: 320, background: "var(--bg3, #272727)",
          border: "1px solid var(--border, #3f3f3f)", borderRadius: 8,
          padding: "12px 16px", fontSize: 15, color: "var(--text, #f1f1f1)",
          textAlign: "center", marginTop: 8,
        }}
      />

      {error && (
        <div style={{ fontSize: 13, color: "#ff6060", maxWidth: 320, lineHeight: 1.5 }}>{error}</div>
      )}

      <button
        onClick={handleConnect}
        disabled={checking}
        style={{
          background: "var(--accent, #ff0000)", border: "none", color: "#fff",
          padding: "12px 32px", borderRadius: 24, cursor: "pointer",
          fontSize: 15, fontWeight: 600, marginTop: 8,
        }}
      >
        {checking ? "Verifica in corso..." : "Connetti"}
      </button>

      <p style={{ fontSize: 12, color: "var(--text3, #717171)", maxWidth: 320, marginTop: 16 }}>
        Il telefono deve essere sulla stessa rete WiFi del PC.
      </p>
    </div>
  );
}
