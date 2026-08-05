import { useState, useEffect, useRef } from "react";
import { api, timeAgo, isCapacitor, getServerBase, clearServerBase, resolveCastBase } from "../api";
import { useToast } from "../hooks/useToast";
import { useCastContext } from "../App";
import { CAST_UNAVAILABLE_MESSAGE } from "../hooks/useCast.jsx";

export default function SettingsPage({ navigate }) {
  const [status, setStatus] = useState(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [oauthStep, setOauthStep] = useState("idle"); // idle | waiting | done
  const [cookieDrag, setCookieDrag] = useState(false);
  const [detectedBrowsers, setDetectedBrowsers] = useState(null); // null = ancora in rilevamento
  const [importingBrowser, setImportingBrowser] = useState(null);
  const fileRef = useRef();
  const { addToast, ToastContainer } = useToast();

  useEffect(() => {
    loadStatus();
    // Ricarica status ogni 3s mentre aspetta OAuth
    const interval = setInterval(loadStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    api.cookieBrowsers().then(d => setDetectedBrowsers(d.browsers || [])).catch(() => setDetectedBrowsers([]));
  }, []);

  const BROWSER_LABELS = { brave: "Brave", chrome: "Chrome", chromium: "Chromium", edge: "Edge", firefox: "Firefox", vivaldi: "Vivaldi", opera: "Opera" };

  async function handleImportCookies(browser) {
    setImportingBrowser(browser);
    try {
      const res = await api.importCookies(browser);
      addToast(`✅ ${res.message}`);
      await loadStatus();
    } catch (e) {
      addToast("❌ " + e.message);
    } finally {
      setImportingBrowser(null);
    }
  }

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
  const cookieLoggedIn = status?.cookie?.logged_in;

  return (
    <div style={{ maxWidth: 700, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>⚙️ Impostazioni</h1>

      {/* ── Diagnostica Cast ─────────────────────────────────────────── */}
      <Section title="Diagnostica Chromecast" icon="🩺">
        <CastDiagnostics />
      </Section>

      {/* ── Server (solo app Android) ───────────────────────────────── */}
      {isCapacitor() && (
        <Section title="Server" icon="🖥️">
          <p style={{ fontSize: 14, color: "var(--text2)", marginBottom: 12, lineHeight: 1.6 }}>
            Connesso a <strong style={{ color: "var(--text)" }}>{getServerBase()}</strong>
          </p>
          <button
            className="action-btn"
            onClick={() => { clearServerBase(); window.location.reload(); }}
          >
            🔄 Cambia indirizzo server
          </button>
        </Section>
      )}

      {/* ── Chromecast ───────────────────────────────────────────────── */}
      <Section title="Chromecast" icon="📺">
        <p style={{ fontSize: 14, color: "var(--text2)", marginBottom: 14, lineHeight: 1.7 }}>
          Per avere la tua <strong>Receiver App personalizzata</strong> (schermata YTProxy sulla TV invece di quella Google generica) devi registrarla gratuitamente.
        </p>
        <ol style={{ fontSize: 14, color: "var(--text2)", lineHeight: 2, paddingLeft: 20 }}>
          <li>Vai su <a href="https://cast.google.com/publish" target="_blank" style={{ color: "var(--accent)" }}>cast.google.com/publish</a> → registra account sviluppatore (5€ una tantum)</li>
          <li>Clicca <strong>"Add new application"</strong> → scegli <strong>"Custom Receiver"</strong></li>
          <li>URL Receiver: <code style={{ background: "var(--bg3)", padding: "1px 6px", borderRadius: 4 }}>http://IP-DEL-TUO-PC:8090/cast-receiver.html</code></li>
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
          I cookie permettono di vedere la <strong>vera home YouTube</strong> e il <strong>feed iscrizioni reale</strong>, con i suggerimenti personalizzati.
        </p>

        {/* Import automatico dal browser installato sulla macchina del server */}
        {detectedBrowsers === null ? (
          <p style={{ fontSize: 13, color: "var(--text3)", marginBottom: 14 }}>🔍 Rilevamento browser sul server...</p>
        ) : detectedBrowsers.length > 0 ? (
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 8 }}>
              Trovata una sessione YouTube attiva — importa i cookie con un click, senza estensioni:
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {detectedBrowsers.map(b => (
                <button
                  key={b}
                  className="action-btn primary"
                  disabled={importingBrowser === b}
                  onClick={() => handleImportCookies(b)}
                >
                  {importingBrowser === b ? "⏳ Importazione..." : `🔗 ${cookiePresent ? "Aggiorna" : "Importa"} da ${BROWSER_LABELS[b] || b}`}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p style={{ fontSize: 13, color: "var(--text3)", marginBottom: 14 }}>
            Nessuna sessione YouTube trovata nei browser sulla macchina del server. Fai login su youtube.com in un browser locale e ricarica questa pagina, oppure importa manualmente:
          </p>
        )}

        {cookiePresent ? (
          <div>
            <StatusRow
              icon={cookieWarning ? "⚠️" : "✅"}
              label={!cookieLoggedIn ? "Cookie senza sessione YouTube" : cookieWarning ? "Cookie da aggiornare" : "Cookie attivi"}
              sublabel={`Età: ${status.cookie.age_days} giorni`}
              color={cookieWarning ? "#ffc800" : "var(--green)"}
            />
            {/* Un file pieno di cookie google.com ma privo di quelli di
                youtube.com lascia yt-dlp anonimo: sembra tutto a posto ma la
                home resta senza raccomandazioni. Va detto esplicitamente. */}
            {!cookieLoggedIn ? (
              <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(255,200,0,0.1)", borderRadius: 8, fontSize: 13, color: "#ffc800" }}>
                ⚠️ Il file non contiene i cookie di sessione di youtube.com: per YouTube sei anonimo, quindi niente home personalizzata.
                Essere loggati su Google non basta — apri <strong>youtube.com</strong> nel browser, controlla di essere loggato, poi reimporta.
              </div>
            ) : cookieWarning && (
              <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(255,200,0,0.1)", borderRadius: 8, fontSize: 13, color: "#ffc800" }}>
                ⚠️ I cookie hanno più di 2 settimane — potresti ricevere il feed locale invece di quello reale. Ricaricali.
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="action-btn" onClick={() => fileRef.current?.click()}>📁 Importa da file</button>
              <button className="action-btn" onClick={handleDeleteCookies}>🗑️ Elimina</button>
            </div>
          </div>
        ) : (
          <div>
            {detectedBrowsers?.length > 0 && (
              <p style={{ fontSize: 12, color: "var(--text3)", margin: "4px 0 10px" }}>
                In alternativa (es. cookie esportati da telefono/altro PC):
              </p>
            )}
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
              <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 4 }}>
                oppure clicca per selezionarlo — esportalo con{" "}
                <a href="https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc" target="_blank" onClick={e => e.stopPropagation()} style={{ color: "var(--accent)" }}>
                  Get cookies.txt
                </a>
              </div>
            </div>
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

/**
 * Perché la trasmissione non parte: mostra in chiaro le condizioni che il
 * browser deve soddisfare, così non serve andare a leggere la console (dove
 * per giunta un filtro sui livelli di log può nascondere l'output).
 */
function CastDiagnostics() {
  const cast = useCastContext();
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const chromeCast = typeof window !== "undefined" && !!window.chrome?.cast;
  const castFw = typeof window !== "undefined" && !!window.cast?.framework;
  const script = typeof document !== "undefined" && !!document.getElementById("__cast_sdk_script");

  // Indirizzo che verrà dato alla TV: se la pagina è aperta su localhost non
  // è quello della barra degli indirizzi ma quello che il server dichiara per
  // la rete locale, quindi va mostrato quello — altrimenti la diagnostica
  // segnalava un problema anche quando la trasmissione funziona.
  const [castBase, setCastBase] = useState(null);
  useEffect(() => { resolveCastBase().then(setCastBase); }, []);

  // Niente riga sull'origine sicura (https): il Cast Sender funziona anche su
  // http in rete locale, segnalarlo come errore mandava fuori strada. Quello
  // che conta davvero è che l'indirizzo non sia localhost, perché è la TV a
  // scaricare il video.
  const rows = [
    ["Indirizzo dato alla TV", castBase === null ? "…" : (castBase || `non ricavabile (pagina su ${origin})`), !!castBase],
    ["Script Google Cast caricato", script ? "sì" : "no", script],
    ["API chrome.cast presente", chromeCast ? "sì" : "no", chromeCast],
    ["Framework Cast pronto", castFw ? "sì" : "no", castFw],
    ["Trasmissione disponibile", cast?.available ? "sì" : "no", !!cast?.available],
    ["Dispositivo collegato", cast?.connected ? cast.deviceName || "sì" : "no", !!cast?.connected],
  ];

  return (
    <div>
      <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
        <tbody>
          {rows.map(([label, value, ok]) => (
            <tr key={label} style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "8px 0", color: "var(--text2)" }}>{label}</td>
              <td style={{ padding: "8px 0", textAlign: "right", color: ok ? "var(--green)" : "#ff6060", wordBreak: "break-all" }}>
                {ok ? "✓ " : "✕ "}{value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!cast?.available && cast?.unavailableReason && (
        <p style={{ fontSize: 13, color: "#ffc800", marginTop: 12, lineHeight: 1.6 }}>
          {CAST_UNAVAILABLE_MESSAGE[cast.unavailableReason] || cast.unavailableReason}
        </p>
      )}
    </div>
  );
}

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
