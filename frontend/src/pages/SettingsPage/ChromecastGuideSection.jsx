import { Section } from "./settingsShared";

const CODE_STYLE = { background: "var(--bg3)", padding: "1px 6px", borderRadius: 4 };

/** Come registrare una Receiver App personalizzata: contenuto statico, nessuno stato. */
export default function ChromecastGuideSection() {
  return (
    <Section title="Chromecast" icon="📺">
      <p style={{ fontSize: 14, color: "var(--text2)", marginBottom: 14, lineHeight: 1.7 }}>
        Per avere la tua <strong>Receiver App personalizzata</strong> (schermata YTProxy sulla TV
        invece di quella Google generica) devi registrarla gratuitamente.
      </p>
      <ol style={{ fontSize: 14, color: "var(--text2)", lineHeight: 2, paddingLeft: 20 }}>
        <li>Vai su <a href="https://cast.google.com/publish" target="_blank" style={{ color: "var(--accent)" }}>cast.google.com/publish</a> → registra account sviluppatore (5€ una tantum)</li>
        <li>Clicca <strong>"Add new application"</strong> → scegli <strong>"Custom Receiver"</strong></li>
        <li>URL Receiver: <code style={CODE_STYLE}>http://IP-DEL-TUO-PC:8090/cast-receiver.html</code></li>
        <li>Copia l'<strong>App ID</strong> generato</li>
        <li>Aggiungilo al file <code style={CODE_STYLE}>frontend/.env</code>: <code style={CODE_STYLE}>VITE_CAST_APP_ID=XXXXXXXX</code></li>
        <li>Rebuild: <code style={CODE_STYLE}>npm run build</code> (web/desktop) oppure <code style={CODE_STYLE}>./scripts/build_apk.sh</code> (app Android — legge lo stesso <code style={CODE_STYLE}>.env</code> e lo passa al Cast SDK nativo)</li>
      </ol>
      <div style={{ marginTop: 14, padding: "10px 14px", background: "rgba(0,200,100,0.08)", borderRadius: 8, fontSize: 13, color: "#00c864" }}>
        💡 Senza registrazione funziona lo stesso con il receiver generico di Google — la differenza
        è solo la schermata che vedi sulla TV durante la riproduzione.
      </div>
    </Section>
  );
}
