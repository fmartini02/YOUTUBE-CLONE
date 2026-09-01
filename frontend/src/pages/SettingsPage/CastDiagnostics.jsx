import { useState, useEffect } from "react";
import { resolveCastBase } from "../../api";
import { useCastContext } from "../../App";
import { CAST_UNAVAILABLE_MESSAGE } from "../../hooks/useCast.jsx";

function buildDiagnosticRows(cast, castBase, origin) {
  const chromeCast = typeof window !== "undefined" && !!window.chrome?.cast;
  const castFw = typeof window !== "undefined" && !!window.cast?.framework;
  const script = typeof document !== "undefined" && !!document.getElementById("__cast_sdk_script");
  // Runtime dove il Cast Web Sender non esiste (Electron, browser non
  // Chromium): lì le righe sull'SDK sarebbero tutte rosse senza dire niente in
  // più della frase di spiegazione. Nell'APK il cast passa dal plugin nativo e
  // `available` lo riflette già da sé.
  const senzaSupporto = ["electron", "browser"].includes(cast?.unavailableReason);
  return [
    ["Indirizzo dato alla TV", castBase === null ? "…" : (castBase || `non ricavabile (pagina su ${origin})`), !!castBase],
    ...(senzaSupporto ? [] : [
      ["Script Google Cast caricato", script ? "sì" : "no", script],
      ["API chrome.cast presente", chromeCast ? "sì" : "no", chromeCast],
      ["Framework Cast pronto", castFw ? "sì" : "no", castFw],
    ]),
    ["Trasmissione disponibile", cast?.available ? "sì" : "no", !!cast?.available],
    ["Dispositivo collegato", cast?.connected ? cast.deviceName || "sì" : "no", !!cast?.connected],
  ];
}

function DiagnosticsTable({ rows }) {
  return (
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
  );
}

/**
 * Perché la trasmissione non parte: mostra in chiaro le condizioni che il
 * browser deve soddisfare, così non serve andare a leggere la console (dove
 * per giunta un filtro sui livelli di log può nascondere l'output).
 */
export default function CastDiagnostics() {
  const cast = useCastContext();
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  // Indirizzo che verrà dato alla TV: se la pagina è aperta su localhost non
  // è quello della barra degli indirizzi ma quello che il server dichiara
  // per la rete locale — altrimenti la diagnostica segnalava un problema
  // anche quando la trasmissione funziona.
  const [castBase, setCastBase] = useState(null);
  useEffect(() => { resolveCastBase().then(setCastBase); }, []);

  const rows = buildDiagnosticRows(cast, castBase, origin);

  return (
    <div>
      {/* La spiegazione sta sopra la tabella: quando la trasmissione non è
          proprio possibile è l'unica riga che serve leggere. */}
      {!cast?.available && cast?.unavailableReason && (
        <p style={{ fontSize: 13, color: "#ffc800", marginBottom: 12, lineHeight: 1.6 }}>
          {CAST_UNAVAILABLE_MESSAGE[cast.unavailableReason] || cast.unavailableReason}
        </p>
      )}
      <DiagnosticsTable rows={rows} />
    </div>
  );
}
