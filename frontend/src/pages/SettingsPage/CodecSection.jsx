import { useEffect, useState } from "react";
import { Section, StatusRow } from "./settingsShared";
import { CODEC_ORDINE, codecScelto, leggiCodec, rilevaCodec } from "../../api";

// Quale codec si usa e con che criterio sono stati accesi i booleani.
function RiepilogoCodec({ dati }) {
  const scelto = CODEC_ORDINE.find(c => c.id === codecScelto());
  const criterio = dati.criterio === "hardware" ? "decodificati in hardware" : "riprodotti in modo fluido (nessun decoder hardware rilevato)";
  return (
    <p style={{ fontSize: 13, color: "var(--text2)", margin: "12px 0" }}>
      In uso: <strong>{scelto ? scelto.nome : "scelta del server"}</strong>. Accesi i codec {criterio}, provati a {dati.altezza}p e 60 fps.
    </p>
  );
}

/**
 * Codec video di QUESTO dispositivo: i tre booleani del test fatto all'avvio
 * (vedi api/codecDevice.js), quale si usa, e un pulsante per rifarlo — serve
 * se il test è stato fatto su un altro schermo o dopo un aggiornamento del
 * browser/WebView. Il risultato vale da sé per ogni dispositivo: l'APK sul
 * telefono e il browser sul PC mostrano ognuno il proprio.
 */
export default function CodecSection() {
  const [dati, setDati] = useState(leggiCodec);
  const [inCorso, setInCorso] = useState(false);
  // Al primo avvio il test può essere ancora in corso quando si apre questa pagina.
  useEffect(() => { if (!dati) rilevaCodec().then(setDati); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ripeti = async () => {
    setInCorso(true);
    setDati(await rilevaCodec(true));
    setInCorso(false);
  };

  return (
    <Section title="Codec video del dispositivo" icon="🎞️">
      {!dati && <div style={{ fontSize: 14, color: "var(--text3)" }}>Test non disponibile su questo browser: il server sceglie il formato da sé.</div>}
      {dati && CODEC_ORDINE.map(c => (
        <StatusRow key={c.id} icon={dati[c.id] ? "✅" : "❌"} label={c.nome} color={dati[c.id] ? undefined : "var(--text3)"} />
      ))}
      {dati && <RiepilogoCodec dati={dati} />}
      <button className="action-btn" onClick={ripeti} disabled={inCorso}>{inCorso ? "Test in corso…" : "Ripeti il test"}</button>
    </Section>
  );
}
