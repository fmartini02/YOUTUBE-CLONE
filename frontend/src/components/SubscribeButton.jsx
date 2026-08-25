import { useState, useEffect } from "react";
import { api, errorMessage } from "../api";

function loadSubStatus(channelId, setStato) {
  let annullato = false;
  setStato(null);
  if (channelId) {
    api.subStatus(channelId)
      .then(d => { if (!annullato) setStato(d); })
      .catch(() => { if (!annullato) setStato({ subscribed: false, authenticated: false, can_subscribe: false }); });
  }
  return () => { annullato = true; };
}

async function toggleSubscription(channel, iscritto, setStato, onNotice, onChange) {
  if (iscritto) {
    await api.unsubscribe(channel.id);
    setStato(s => ({ ...s, subscribed: false }));
    onNotice?.(`Iscrizione annullata${channel.name ? `: ${channel.name}` : ""}`);
    onChange?.(false, channel.id);
  } else {
    await api.subscribe(channel.id, { name: channel.name || "", thumbnail: channel.thumbnail || "" });
    setStato(s => ({ ...s, subscribed: true }));
    onNotice?.(`Iscritto${channel.name ? ` a ${channel.name}` : ""}`);
    onChange?.(true, channel.id);
  }
}

// Il pulsante sta dentro elementi già cliccabili (la card di un canale nella
// lista iscrizioni): senza stopPropagation, iscriversi aprirebbe il canale.
// Disiscriversi chiede conferma, iscriversi no: un'iscrizione di troppo si
// annulla con lo stesso pulsante che si ha già sotto il dito, mentre per
// rifare un'iscrizione persa bisogna ritrovare il canale.
async function handleSubscribeClick(e, channel, state, setters, callbacks) {
  e.stopPropagation();
  const { stato, busy, iscritto } = state;
  const { setStato, setBusy } = setters;
  const { onNotice, onChange } = callbacks;
  if (busy || !stato) return;
  if (!stato.authenticated) {
    onNotice?.("Collega un account Google dalle impostazioni per iscriverti ai canali");
    return;
  }
  if (!stato.can_subscribe) {
    onNotice?.("L'account collegato può solo leggere: ricollegalo dalle impostazioni per iscriverti");
    return;
  }
  if (iscritto && !window.confirm(`Annullare l'iscrizione a ${channel.name || "questo canale"}?`)) return;

  setBusy(true);
  try {
    await toggleSubscription(channel, iscritto, setStato, onNotice, onChange);
  } catch (err) {
    onNotice?.(errorMessage(err, "Operazione non riuscita"));
  } finally {
    setBusy(false);
  }
}

/**
 * Pulsante "Iscriviti" / "Iscritto" di un canale.
 *
 * Iscriversi e disiscriversi passano dalla YouTube Data API, quindi servono
 * l'account Google collegato E lo scope di scrittura: chi si era collegato
 * quando l'app leggeva soltanto ha un token che non lo comprende e deve
 * rifare il login. Come CastButton, il pulsante resta comunque visibile e
 * spiega cosa manca quando lo si preme.
 *
 * Lo stato iniziale arriva dal server (copia locale delle iscrizioni): finché
 * non arriva il pulsante è disabilitato, per non mostrare "Iscriviti" su un
 * canale a cui si è già iscritti.
 */
export default function SubscribeButton({ channelId, channelName, thumbnail, onNotice, onChange, small = false }) {
  const [stato, setStato] = useState(null);   // null = ancora da leggere
  const [busy, setBusy] = useState(false);

  useEffect(() => loadSubStatus(channelId, setStato), [channelId]);

  if (!channelId) return null;

  const iscritto = !!stato?.subscribed;
  const channel = { id: channelId, name: channelName, thumbnail };
  const onClick = e =>
    handleSubscribeClick(e, channel, { stato, busy, iscritto }, { setStato, setBusy }, { onNotice, onChange });

  const testo = busy ? "..." : iscritto ? "✓ Iscritto" : "Iscriviti";
  const titolo = !stato ? "Caricamento..."
    : !stato.authenticated ? "Serve un account Google collegato"
    : !stato.can_subscribe ? "L'account collegato non ha il permesso di iscriversi"
    : iscritto ? "Annulla iscrizione" : "Iscriviti al canale";

  return (
    <button
      className={`subscribe-btn${iscritto ? " subscribed" : ""}${small ? " small" : ""}`}
      onClick={onClick}
      disabled={!stato || busy}
      title={titolo}
    >
      {testo}
    </button>
  );
}
