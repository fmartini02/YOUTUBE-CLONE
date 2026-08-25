function DropzoneHint() {
  return (
    <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 4 }}>
      oppure clicca per selezionarlo — esportalo con{" "}
      <a
        href="https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc"
        target="_blank" onClick={e => e.stopPropagation()} style={{ color: "var(--accent)" }}
      >
        Get cookies.txt
      </a>
    </div>
  );
}

function AltraSorgenteHint({ detectedBrowsers }) {
  if (!(detectedBrowsers?.length > 0)) return null;
  return (
    <p style={{ fontSize: 12, color: "var(--text3)", margin: "4px 0 10px" }}>
      In alternativa (es. cookie esportati da telefono/altro PC):
    </p>
  );
}

export default function CookieDropzone({ detectedBrowsers, cookieDrag, setCookieDrag, onFile, onClick }) {
  const zoneStyle = {
    border: `2px dashed ${cookieDrag ? "var(--accent)" : "var(--border)"}`,
    borderRadius: 12, padding: "32px 24px", textAlign: "center", cursor: "pointer",
    transition: "border-color 0.2s", background: cookieDrag ? "rgba(255,0,0,0.05)" : "transparent",
  };
  return (
    <div>
      <AltraSorgenteHint detectedBrowsers={detectedBrowsers} />
      <div
        style={zoneStyle}
        onClick={onClick}
        onDragOver={e => { e.preventDefault(); setCookieDrag(true); }}
        onDragLeave={() => setCookieDrag(false)}
        onDrop={e => { e.preventDefault(); setCookieDrag(false); onFile(e.dataTransfer.files[0]); }}
      >
        <div style={{ fontSize: 32, marginBottom: 8 }}>🍪</div>
        <div style={{ fontSize: 14, color: "var(--text2)" }}>Trascina qui il file <strong>cookies.txt</strong></div>
        <DropzoneHint />
      </div>
    </div>
  );
}
