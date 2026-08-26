import { useState } from "react";
import { setServerBase, checkServerReachable, getServerBase } from "../api";

function normalizeServerUrl(raw) {
  let url = raw;
  if (!/^https?:\/\//i.test(url)) url = "http://" + url;
  try {
    const u = new URL(url);
    if (!u.port) u.port = "8090"; // porta di default se l'utente non l'ha indicata
    return u.toString().replace(/\/$/, "");
  } catch {
    if (!/:\d+$/.test(url)) url += ":8090";
    return url;
  }
}

async function connectToServer(address, setError, setChecking, onDone) {
  const raw = address.trim();
  if (!raw) { setError("Inserisci l'indirizzo del PC"); return; }
  const url = normalizeServerUrl(raw);

  setChecking(true);
  setError("");
  const ok = await checkServerReachable(url);
  setChecking(false);

  if (!ok) {
    setError("Impossibile raggiungere il server a questo indirizzo. Verifica che il PC sia acceso, il server avviato (scripts/start_server.sh), e che il telefono sia sulla stessa rete WiFi.");
    return;
  }
  setServerBase(url);
  onDone();
}

function ServerSetupIntro() {
  return (
    <>
      <div style={{ fontSize: 48, color: "var(--accent, #ff0000)" }}>▶</div>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>YTProxy</h1>
      <p style={{ fontSize: 14, color: "var(--text2, #aaa)", maxWidth: 340, lineHeight: 1.6, margin: 0 }}>
        Questa app si collega al server YTProxy che gira sul tuo PC. Inserisci il suo indirizzo
        — lo trovi stampato quando avvii <code>scripts/start_server.sh</code>, o con <code>hostname -I</code> sul PC.
      </p>
    </>
  );
}

const INPUT_STYLE = {
  width: "100%", maxWidth: 320, background: "var(--bg3, #272727)",
  border: "1px solid var(--border, #3f3f3f)", borderRadius: 8,
  padding: "12px 16px", fontSize: 15, color: "var(--text, #f1f1f1)",
  textAlign: "center", marginTop: 8,
};
const CONNECT_BTN_STYLE = {
  background: "var(--accent, #ff0000)", border: "none", color: "#fff",
  padding: "12px 32px", borderRadius: 24, cursor: "pointer",
  fontSize: 15, fontWeight: 600, marginTop: 8,
};

function ServerSetupForm({ address, setAddress, checking, error, onConnect }) {
  return (
    <>
      <input
        value={address}
        onChange={e => setAddress(e.target.value)}
        onKeyDown={e => e.key === "Enter" && onConnect()}
        placeholder="es. 192.168.1.11:8090"
        autoCapitalize="off"
        autoCorrect="off"
        style={INPUT_STYLE}
      />
      {error && <div style={{ fontSize: 13, color: "#ff6060", maxWidth: 320, lineHeight: 1.5 }}>{error}</div>}
      <button onClick={onConnect} disabled={checking} style={CONNECT_BTN_STYLE}>
        {checking ? "Verifica in corso..." : "Connetti"}
      </button>
    </>
  );
}

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
  const onConnect = () => connectToServer(address, setError, setChecking, onDone);

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 16,
      background: "var(--bg, #0f0f0f)", color: "var(--text, #f1f1f1)",
      padding: 24, textAlign: "center",
    }}>
      <ServerSetupIntro />
      <ServerSetupForm address={address} setAddress={setAddress} checking={checking} error={error} onConnect={onConnect} />
      <p style={{ fontSize: 12, color: "var(--text3, #717171)", maxWidth: 320, marginTop: 16 }}>
        Il telefono deve essere sulla stessa rete WiFi del PC.
      </p>
    </div>
  );
}
