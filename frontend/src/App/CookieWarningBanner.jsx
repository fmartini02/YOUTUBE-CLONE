import { COOKIE_WARNING_TEXT } from "./useCookieWarning";

export default function CookieWarningBanner({ cookieReason, onUpdate, onDismiss }) {
  return (
    <div className="cookie-banner">
      <span aria-hidden="true">⚠️</span>
      <span className="cookie-banner-text">{COOKIE_WARNING_TEXT[cookieReason] || COOKIE_WARNING_TEXT.stale}</span>
      <button className="action-btn cookie-banner-btn" onClick={onUpdate}>Aggiorna</button>
      <button className="cookie-banner-close" onClick={onDismiss} title="Nascondi questo avviso" aria-label="Nascondi questo avviso">
        ✕
      </button>
    </div>
  );
}
