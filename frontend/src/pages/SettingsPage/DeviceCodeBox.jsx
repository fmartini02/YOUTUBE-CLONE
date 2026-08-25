function DeviceCodeIntro({ device }) {
  return (
    <p style={{ fontSize: 14, color: "var(--text2)", marginBottom: 12, lineHeight: 1.6 }}>
      Apri{" "}
      <a href={device.verification_url} target="_blank" style={{ color: "var(--accent)", fontWeight: 600 }}>
        {(device.verification_url || "").replace(/^https?:\/\//, "")}
      </a>{" "}
      da questo o da qualsiasi altro dispositivo e digita il codice:
    </p>
  );
}

export default function DeviceCodeBox({ device, onCopy }) {
  return (
    <div style={{ marginTop: 14, padding: 16, background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 12 }}>
      <DeviceCodeIntro device={device} />
      <div
        onClick={onCopy}
        title="Clicca per copiare"
        style={{
          fontFamily: "monospace", fontSize: 30, fontWeight: 700, letterSpacing: 4,
          textAlign: "center", padding: "14px 10px", background: "var(--bg)",
          border: "1px solid var(--border)", borderRadius: 10, cursor: "pointer", userSelect: "all",
        }}
      >
        {device.user_code}
      </div>
      <p style={{ fontSize: 13, color: "#ffc800", marginTop: 12 }}>
        ⏳ In attesa dell'autorizzazione... si collega da solo appena confermi.
      </p>
    </div>
  );
}
