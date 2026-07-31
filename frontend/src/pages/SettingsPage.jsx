import { useState, useEffect, useRef } from "react";
import { api, timeAgo } from "../api";
import { useToast } from "../hooks/useToast";

export default function SettingsPage({ navigate }) {
  const [status, setStatus] = useState(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [oauthStep, setOauthStep] = useState("idle"); // idle | waiting | done
  const [cookieDrag, setCookieDrag] = useState(false);
  const fileRef = useRef();
  const { addToast, ToastContainer } = useToast();

  useEffect(() => {
    loadStatus();
    // Ricarica status ogni 3s mentre aspetta OAuth
    const interval = setInterval(loadStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  async function loadStatus() {
    try {
      const s = await api.authStatus();
      setStatus(s);
      if (s.authenticated && oauthStep === "waiting") setOauthStep("done");
    } catch {}
  }

  async function startOAuth() {
    if (!clientId || !clientSecret) {
      addToast("⚠️ Inserisci Client ID e Client Secret");
      return;
    }
    try {
      const { auth_url } = await api.getAuthUrl(clientId, clientSecret);
      window.open(auth_url, "_blank", "width=500,height=700");
      setOauthStep("waiting");
      addToast("🔑 Finestra di login aperta — accedi con Google");
    } catch (e) {
      addToast("❌ Errore: " + e.message);
    }
  }

  async function handleLogout() {
    await api.logout();
    setOauthStep("idle");
    await loadStatus();
    addToast("Account disconnesso");
  }

  async function handleCookieFile(file) {
    if (!file) return;
    try {
      const res = await api.uploadCookies(file);
      addToast(`✅ ${res.message}`);
      await loadStatus();
    } catch (e) {
      addToast("❌ " + e.message);
    }
  }

  async function handleSync() {
    addToast("🔄 Sincronizzazione in corso...");
    try {
      const res = await api.syncSubs();
      addToast(`✅ ${res.subscriptions.length} canali sincronizzati`);
      await loadStatus();
    } catch (e) {
      addToast("❌ Errore sync: " + e.message);
    }
  }

  async function handleDeleteCookies() {
    await api.deleteCookies();
    addToast("Cookie eliminati");
    await loadStatus();
  }

  const authenticated = status?.authenticated;
  const cookiePresent = status?.cookie?.present;
  const cookieWarning = status?.cookie?.warning;

  return (
    <div style={{ maxWidth: 700, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>⚙️ Impostazioni</h1>

      {/* ── Chromecast ───────────────────────────────────────────────── */}
      <Section title="Chromecast" icon="📺">
        <p style={{ fontSize: 14, color: "var(--text2)", marginBottom: 14, lineHeight: 1.7 }}>
          Per avere la tua <strong>Receiver App personalizzata</strong> (schermata YTProxy sulla TV invece di quella Google generica) devi registrarla gratuitamente.
        </p>
        <ol style={{ fontSize: 14, color: "var(--text2)", lineHeight: 2, paddingLeft: 20 }}>
          <li>Vai su <a href="https://cast.google.com/publish" target="_blank" style={{ color: "var(--accent)" }}>cast.google.com/publish</a> → registra account sviluppatore (5€ una tantum)</li>
          <li>Clicca <strong>"Add new application"</strong> → scegli <strong>"Custom Receiver"</strong></li>
          <li>URL Receiver: <code style={{ background: "var(--bg3)", padding: "1px 6px", borderRadius: 4 }}>http://IP-DEL-TUO-PC:8080/cast-receiver.html</code></li>
          <li>Copia l'<strong>App ID</strong> generato</li>
          <li>Aggiungilo al file <code style={{ background: "var(--bg3)", padding: "1px 6px", borderRadius: 4 }}>.env</code>: <code style={{ background: "var(--bg3)", padding: "1px 6px", borderRadius: 4 }}>VITE_CAST_APP_ID=XXXXXXXX</code></li>
          <li>Rebuild frontend: <code style={{ background: "var(--bg3)", padding: "1px 6px", borderRadius: 4 }}>npm run build</code></li>
        </ol>
        <div style={{ marginTop: 14, padding: "10px 14px", background: "rgba(0,200,100,0.08)", borderRadius: 8, fontSize: 13, color: "#00c864" }}>
          💡 Senza registrazione funziona lo stesso con il receiver generico di Google — la differenza è solo la schermata che vedi sulla TV durante la riproduzione.
        </div>
      </Section>

      {/* ── Account Google ───────────────────────────────────────────── */}
      <Section title="Account Google" icon="🔑">
        {authenticated ? (
          <div>
            <StatusRow
              icon="✅"
              label="Account collegato"
              sublabel={`${status.subscription_count} canali iscritti`}
              color="var(--green)"
            />
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button className="action-btn" onClick={handleSync}>🔄 Sincronizza ora</button>
              <button className="action-btn" onClick={handleLogout}>🚪 Disconnetti</button>
            </div>
            {status.sync?.last_sync > 0 && (
              <p style={{ fontSize: 12, color: "var(--text3)", marginTop: 8 }}>
                Ultimo sync: {timeAgo(status.sync.last_sync)} • prossimo tra ~1 ora
              </p>
            )}
          </div>
        ) : (
          <div>
            <p style={{ fontSize: 14, color: "var(--text2)", marginBottom: 16, lineHeight: 1.6 }}>
              Per sincronizzare le iscrizioni serve un <strong>Client ID Google</strong> gratuito.
              <br />
              <a href="https://console.cloud.google.com" target="_blank" style={{ color: "var(--accent)" }}>
                console.cloud.google.com
              </a>
              {" "}→ Crea progetto → API & Servizi → Credenziali → OAuth 2.0 → <em>YouTube Data API v3</em>
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input
                className="search-input"
                style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px", fontSize: 14, width: "100%" }}
                placeholder="Client ID  (es. 123456789-abc.apps.googleusercontent.com)"
                value={clientId}
                onChange={e => setClientId(e.target.value)}
              />
              <input
                className="search-input"
                style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px", fontSize: 14, width: "100%" }}
                placeholder="Client Secret  (es. GOCSPX-...)"
                type="password"
                value={clientSecret}
                onChange={e => setClientSecret(e.target.value)}
              />
              <button className="action-btn primary" onClick={startOAuth} style={{ alignSelf: "flex-start" }}>
                🔑 Accedi con Google
              </button>
            </div>

            {oauthStep === "waiting" && (
              <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(255,200,0,0.1)", borderRadius: 8, fontSize: 13, color: "#ffc800" }}>
                ⏳ Aspettando il login nella finestra aperta...
              </div>
            )}
          </div>
        )}
      </Section>

      {/* ── Cookie ───────────────────────────────────────────────────── */}
      <Section title="Cookie YouTube" icon="🍪">
        <p style={{ fontSize: 14, color: "var(--text2)", marginBottom: 14, lineHeight: 1.6 }}>
          I cookie permettono di vedere il <strong>feed abbonamenti reale</strong> con i suggerimenti personalizzati.
          <br />
          Installa <a href="https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc" target="_blank" style={{ color: "var(--accent)" }}>
            Get cookies.txt
          </a>{" "}su Chrome, vai su youtube.com mentre sei loggato, esporta e trascina qui il file.
        </p>

        {cookiePresent ? (
          <div>
            <StatusRow
              icon={cookieWarning ? "⚠️" : "✅"}
              label={cookieWarning ? "Cookie da aggiornare" : "Cookie attivi"}
              sublabel={`Età: ${status.cookie.age_days} giorni`}
              color={cookieWarning ? "#ffc800" : "var(--green)"}
            />
            {cookieWarning && (
              <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(255,200,0,0.1)", borderRadius: 8, fontSize: 13, color: "#ffc800" }}>
                ⚠️ I cookie hanno più di 2 settimane — potresti ricevere il feed locale invece di quello reale. Ricaricali.
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="action-btn" onClick={() => fileRef.current?.click()}>🔄 Aggiorna cookie</button>
              <button className="action-btn" onClick={handleDeleteCookies}>🗑️ Elimina</button>
            </div>
          </div>
        ) : (
          <div
            style={{
              border: `2px dashed ${cookieDrag ? "var(--accent)" : "var(--border)"}`,
              borderRadius: 12, padding: "32px 24px", textAlign: "center", cursor: "pointer",
              transition: "border-color 0.2s", background: cookieDrag ? "rgba(255,0,0,0.05)" : "transparent"
            }}
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setCookieDrag(true); }}
            onDragLeave={() => setCookieDrag(false)}
            onDrop={e => { e.preventDefault(); setCookieDrag(false); handleCookieFile(e.dataTransfer.files[0]); }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>🍪</div>
            <div style={{ fontSize: 14, color: "var(--text2)" }}>Trascina qui il file <strong>cookies.txt</strong></div>
            <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 4 }}>oppure clicca per selezionarlo</div>
          </div>
        )}

        <input ref={fileRef} type="file" accept=".txt" style={{ display: "none" }}
          onChange={e => handleCookieFile(e.target.files[0])} />
      </Section>

      {/* ── Preferenze ───────────────────────────────────────────────── */}
      <Section title="Preferenze" icon="🎛️">
        <PrefRow
          label="Qualità video predefinita"
          value={status?.prefs?.quality || "best"}
          options={[
            { value: "best", label: "Migliore disponibile" },
            { value: "1080", label: "1080p" },
            { value: "720", label: "720p" },
            { value: "480", label: "480p" },
          ]}
          onChange={v => api.updatePrefs({ quality: v }).then(loadStatus)}
        />
        <PrefToggle
          label="Autoplay video"
          value={status?.prefs?.autoplay !== false}
          onChange={v => api.updatePrefs({ autoplay: v }).then(loadStatus)}
        />
      </Section>

      {/* ── Cronologia ───────────────────────────────────────────────── */}
      <Section title="Cronologia" icon="🕐">
        <p style={{ fontSize: 14, color: "var(--text2)", marginBottom: 12 }}>
          La cronologia è salvata localmente sul server.
        </p>
        <button className="action-btn" onClick={async () => {
          await api.clearHistory();
          addToast("Cronologia cancellata");
        }}>🗑️ Cancella cronologia</button>
      </Section>

      <ToastContainer />
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, icon, children }) {
  return (
    <div style={{ background: "var(--bg2)", borderRadius: 12, padding: 20, marginBottom: 16 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
        <span>{icon}</span> {title}
      </h2>
      {children}
    </div>
  );
}

function StatusRow({ icon, label, sublabel, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: color || "var(--text)" }}>{label}</div>
        {sublabel && <div style={{ fontSize: 12, color: "var(--text3)" }}>{sublabel}</div>}
      </div>
    </div>
  );
}

function PrefRow({ label, value, options, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ fontSize: 14 }}>{label}</span>
      <select className="quality-select" value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function PrefToggle({ label, value, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0" }}>
      <span style={{ fontSize: 14 }}>{label}</span>
      <div
        onClick={() => onChange(!value)}
        style={{
          width: 44, height: 24, borderRadius: 12, cursor: "pointer",
          background: value ? "var(--accent)" : "var(--border)",
          position: "relative", transition: "background 0.2s",
        }}
      >
        <div style={{
          width: 18, height: 18, borderRadius: "50%", background: "#fff",
          position: "absolute", top: 3, left: value ? 23 : 3,
          transition: "left 0.2s",
        }} />
      </div>
    </div>
  );
}
