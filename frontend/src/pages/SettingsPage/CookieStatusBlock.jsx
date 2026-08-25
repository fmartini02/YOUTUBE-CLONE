import { StatusRow } from "./settingsShared";

// Un file pieno di cookie google.com ma privo di quelli di youtube.com lascia
// yt-dlp anonimo: sembra tutto a posto ma la home resta senza raccomandazioni.
// Va detto esplicitamente.
function CookieWarningBanner({ cookieLoggedIn, cookieWarning }) {
  const style = { marginTop: 8, padding: "8px 12px", background: "rgba(255,200,0,0.1)", borderRadius: 8, fontSize: 13, color: "#ffc800" };
  if (!cookieLoggedIn) {
    return (
      <div style={style}>
        ⚠️ Il file non contiene i cookie di sessione di youtube.com: per YouTube sei anonimo, quindi
        niente home personalizzata. Essere loggati su Google non basta — apri <strong>youtube.com</strong> nel
        browser, controlla di essere loggato, poi reimporta.
      </div>
    );
  }
  if (cookieWarning) {
    return <div style={style}>⚠️ I cookie hanno più di 2 settimane — potresti ricevere il feed locale invece di quello reale. Ricaricali.</div>;
  }
  return null;
}

export default function CookieStatusBlock({ status, onImportFile, onDelete }) {
  const cookieWarning = status?.cookie?.warning;
  const cookieLoggedIn = status?.cookie?.logged_in;
  return (
    <div>
      <StatusRow
        icon={cookieWarning ? "⚠️" : "✅"}
        label={!cookieLoggedIn ? "Cookie senza sessione YouTube" : cookieWarning ? "Cookie da aggiornare" : "Cookie attivi"}
        sublabel={`Età: ${status.cookie.age_days} giorni`}
        color={cookieWarning ? "#ffc800" : "var(--green)"}
      />
      <CookieWarningBanner cookieLoggedIn={cookieLoggedIn} cookieWarning={cookieWarning} />
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button className="action-btn" onClick={onImportFile}>📁 Importa da file</button>
        <button className="action-btn" onClick={onDelete}>🗑️ Elimina</button>
      </div>
    </div>
  );
}
