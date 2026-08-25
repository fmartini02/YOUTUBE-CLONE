import DeviceCodeBox from "./DeviceCodeBox";

const INPUT_STYLE = {
  background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8,
  padding: "10px 14px", fontSize: 14, width: "100%",
};

function ClientCredentialsForm({ clientId, setClientId, clientSecret, setClientSecret, onStart }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <input
        className="search-input" style={INPUT_STYLE}
        placeholder="Client ID  (es. 123456789-abc.apps.googleusercontent.com)"
        value={clientId} onChange={e => setClientId(e.target.value)}
      />
      <input
        className="search-input" style={INPUT_STYLE} type="password"
        placeholder="Client Secret  (es. GOCSPX-...)"
        value={clientSecret} onChange={e => setClientSecret(e.target.value)}
      />
      <button className="action-btn primary" onClick={onStart} style={{ alignSelf: "flex-start" }}>
        🔑 Accedi con Google
      </button>
    </div>
  );
}

function OAuthSetupIntro() {
  return (
    <p style={{ fontSize: 14, color: "var(--text2)", marginBottom: 16, lineHeight: 1.6 }}>
      Per sincronizzare le iscrizioni serve un <strong>Client ID Google</strong> gratuito.
      <br />
      <a href="https://console.cloud.google.com" target="_blank" style={{ color: "var(--accent)" }}>
        console.cloud.google.com
      </a>
      {" "}→ Crea progetto → abilita <em>YouTube Data API v3</em> → Credenziali → ID client OAuth →
      tipo <strong>“TV e dispositivi con input limitato”</strong>.
      <br />
      <span style={{ fontSize: 13, color: "var(--text3)" }}>
        Quel tipo non chiede nessun URI di reindirizzamento: il login funziona anche quando il
        server gira su un'altra macchina della rete (Raspberry, NAS).
      </span>
    </p>
  );
}

export default function UnauthenticatedAccount({
  clientId, setClientId, clientSecret, setClientSecret, oauthStep, device, startOAuth, addToast,
}) {
  return (
    <div>
      <OAuthSetupIntro />
      <ClientCredentialsForm
        clientId={clientId} setClientId={setClientId}
        clientSecret={clientSecret} setClientSecret={setClientSecret} onStart={startOAuth}
      />
      {oauthStep === "waiting" && device && (
        <DeviceCodeBox device={device} onCopy={() => { navigator.clipboard?.writeText(device.user_code); addToast("📋 Codice copiato"); }} />
      )}
    </div>
  );
}
