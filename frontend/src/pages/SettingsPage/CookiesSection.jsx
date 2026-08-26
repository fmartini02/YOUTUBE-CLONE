import { Section } from "./settingsShared";
import BrowserImportList from "./BrowserImportList";
import CookieStatusBlock from "./CookieStatusBlock";
import CookieDropzone from "./CookieDropzone";

function CookiesIntro() {
  return (
    <p style={{ fontSize: 14, color: "var(--text2)", marginBottom: 14, lineHeight: 1.6 }}>
      I cookie permettono di vedere la <strong>vera home YouTube</strong> e il <strong>feed iscrizioni reale</strong>,
      con i suggerimenti personalizzati.
    </p>
  );
}

export default function CookiesSection({ status, cookies }) {
  const cookiePresent = status?.cookie?.present;
  return (
    <Section title="Cookie YouTube" icon="🍪">
      <CookiesIntro />
      <BrowserImportList
        detectedBrowsers={cookies.detectedBrowsers} importingBrowser={cookies.importingBrowser}
        cookiePresent={cookiePresent} onImport={cookies.handleImportCookies}
      />
      {cookiePresent ? (
        <CookieStatusBlock status={status} onImportFile={() => cookies.fileRef.current?.click()} onDelete={cookies.handleDeleteCookies} />
      ) : (
        <CookieDropzone
          detectedBrowsers={cookies.detectedBrowsers} cookieDrag={cookies.cookieDrag} setCookieDrag={cookies.setCookieDrag}
          onFile={cookies.handleCookieFile} onClick={() => cookies.fileRef.current?.click()}
        />
      )}
      <input
        ref={cookies.fileRef} type="file" accept=".txt" style={{ display: "none" }}
        onChange={e => cookies.handleCookieFile(e.target.files[0])}
      />
    </Section>
  );
}
