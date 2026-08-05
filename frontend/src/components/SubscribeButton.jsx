import { useState, useEffect } from "react";
import { api, errorMessage } from "../api";

/**
 * Pulsante "Iscriviti" / "Iscritto" di un canale.
 *
 * Iscriversi e disiscriversi passano dalla YouTube Data API, quindi servono
 * l'account Google collegato E lo scope di scrittura: chi si era collegato
 * quando l'app leggeva soltanto ha un token che non lo comprende e deve
 * rifare il login. Come CastButton, il pulsante resta comunque visibile e
 * spiega cosa manca quando lo si preme — sparire lascerebbe l'utente a
 * chiedersi perché su un canale il pulsante c'è e su un altro no.
 *
 * Lo stato iniziale arriva dal server (copia locale delle iscrizioni): finché
 * non arriva il pulsante è disabilitato, per non mostrare "Iscriviti" su un
 * canale a cui si è già iscritti.
 */
export default function SubscribeButton({ channelId, channelName, thumbnail, onNotice, onChange, small = false }) {
  const [stato, setStato] = useState(null);   // null = ancora da leggere
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let annullato = false;
    setStato(null);
    if (!channelId) return;
    api.subStatus(channelId)
      .then(d => { if (!annullato) setStato(d); })
      .catch(() => { if (!annullato) setStato({ subscribed: false, authenticated: false, can_subscribe: false }); });
    return () => { annullato = true; };
  }, [channelId]);

  if (!channelId) return null;

  const iscritto = !!stato?.subscribed;

  async function handleClick(e) {
    // Il pulsante sta dentro elementi già cliccabili (la card di un canale
    // nella lista iscrizioni): senza questo, iscriversi aprirebbe il canale.
    e.stopPropagation();
    if (busy || !stato) return;

    if (!stato.authenticated) {
      onNotice?.("Collega un account Google dalle impostazioni per iscriverti ai canali");
      return;
    }
    if (!stato.can_subscribe) {
      onNotice?.("L'account collegato può solo leggere: ricollegalo dalle impostazioni per iscriverti");
      return;
    }

    setBusy(true);
    try {
      if (iscritto) {
        await api.unsubscribe(channelId);
        setStato(s => ({ ...s, subscribed: false }));
        onNotice?.(`Iscrizione annullata${channelName ? `: ${channelName}` : ""}`);
        onChange?.(false, channelId);
      } else {
        await api.subscribe(channelId, { name: channelName || "", thumbnail: thumbnail || "" });
        setStato(s => ({ ...s, subscribed: true }));
        onNotice?.(`Iscritto${channelName ? ` a ${channelName}` : ""}`);
        onChange?.(true, channelId);
      }
    } catch (err) {
      onNotice?.(errorMessage(err, "Operazione non riuscita"));
    } finally {
      setBusy(false);
    }
  }

  const testo = busy ? "..." : iscritto ? "✓ Iscritto" : "Iscriviti";
  const titolo = !stato ? "Caricamento..."
    : !stato.authenticated ? "Serve un account Google collegato"
    : !stato.can_subscribe ? "L'account collegato non ha il permesso di iscriversi"
    : iscritto ? "Annulla iscrizione" : "Iscriviti al canale";

  return (
    <button
      className={`subscribe-btn${iscritto ? " subscribed" : ""}${small ? " small" : ""}`}
      onClick={handleClick}
      disabled={!stato || busy}
      title={titolo}
    >
      {testo}
    </button>
  );
}
