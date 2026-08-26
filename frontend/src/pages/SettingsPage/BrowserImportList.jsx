import { BROWSER_LABELS } from "./useCookieManagement";

function ImportButtons({ detectedBrowsers, importingBrowser, cookiePresent, onImport }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 8 }}>
        Trovata una sessione YouTube attiva — importa i cookie con un click, senza estensioni:
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {detectedBrowsers.map(b => (
          <button key={b} className="action-btn primary" disabled={importingBrowser === b} onClick={() => onImport(b)}>
            {importingBrowser === b ? "⏳ Importazione..." : `🔗 ${cookiePresent ? "Aggiorna" : "Importa"} da ${BROWSER_LABELS[b] || b}`}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Import automatico dal browser installato SULLA MACCHINA DEL SERVER, senza estensioni. */
export default function BrowserImportList({ detectedBrowsers, importingBrowser, cookiePresent, onImport }) {
  if (detectedBrowsers === null) {
    return <p style={{ fontSize: 13, color: "var(--text3)", marginBottom: 14 }}>🔍 Rilevamento browser sul server...</p>;
  }
  if (detectedBrowsers.length === 0) {
    return (
      <p style={{ fontSize: 13, color: "var(--text3)", marginBottom: 14 }}>
        Nessuna sessione YouTube trovata nei browser sulla macchina del server. Fai login su
        youtube.com in un browser locale e ricarica questa pagina, oppure importa manualmente:
      </p>
    );
  }
  return <ImportButtons detectedBrowsers={detectedBrowsers} importingBrowser={importingBrowser} cookiePresent={cookiePresent} onImport={onImport} />;
}
