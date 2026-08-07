import { useEffect, useState } from "react";
import { api, errorMessage } from "../api";

/**
 * Tasto "Iscriviti / Iscritto" dell'intestazione canale.
 *
 * Iscriversi e disiscriversi passano dalla YouTube Data API, quindi servono
 * l'account Google collegato e lo scope di scrittura. Come CastButton, il
 * tasto resta visibile anche quando non si può usare e spiega il motivo al
 * clic: sparire lascerebbe l'utente a chiedersi dove sia finito.
 *
 * La disiscrizione chiede conferma perché è un clic solo a separare
 * dall'aver perso un'iscrizione, e per rifarla bisogna ritrovare il canale.
 */
export default function SubscribeButton({ channelId, channelName, subscribed, canSubscribe, onToast }) {
  const [iscritto, setIscritto] = useState(!!subscribed);
  const [busy, setBusy] = useState(false);

  // L'intestazione arriva dopo il primo render, e cambiando canale il tasto
  // non viene smontato: lo stato va riallineato a quello che dice il server.
  useEffect(() => { setIscritto(!!subscribed); }, [subscribed, channelId]);

  async function toggle() {
    if (busy || !channelId) return;
    if (!canSubscribe) {
      onToast?.("Per gestire le iscrizioni collega un account Google dalle Impostazioni");
      return;
    }
    if (iscritto && !window.confirm(`Annullare l'iscrizione a ${channelName || "questo canale"}?`)) return;

    setBusy(true);
    try {
      if (iscritto) {
        await api.unsubscribe(channelId);
        setIscritto(false);
        onToast?.(`Iscrizione annullata${channelName ? `: ${channelName}` : ""}`);
      } else {
        await api.subscribe(channelId);
        setIscritto(true);
        onToast?.(`Iscritto a ${channelName || "canale"}`);
      }
    } catch (e) {
      onToast?.(errorMessage(e, "Operazione non riuscita"));
    } finally {
      setBusy(false);
    }
  }

  const testo = busy ? "Attendi…" : iscritto ? "Iscritto ✓" : "Iscriviti";

  return (
    <button
      className={`chip${iscritto ? "" : " active"}`}
      onClick={toggle}
      disabled={busy}
      title={
        !canSubscribe ? "Serve un account Google collegato (Impostazioni)"
          : iscritto ? "Annulla iscrizione" : "Iscriviti al canale"
      }
      style={{
        marginLeft: "auto", flexShrink: 0,
        padding: "9px 18px", borderRadius: 20, fontWeight: 600,
        opacity: busy || !canSubscribe ? 0.6 : 1,
        cursor: busy ? "default" : "pointer",
      }}
    >
      {testo}
    </button>
  );
}
