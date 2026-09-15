// mseBuffer.js — primitive sul SourceBuffer di MediaSource, senza sapere
// niente di rete o di fetch: isolate qui perché `msePump.js` (il ciclo di
// lettura/scrittura) e `useStreamSource.js` (barra di avanzamento) le usano
// entrambi. Vedi mseStream.js per il quadro d'insieme.
import { MSE_EVICT_BEHIND_S } from "./playerConstants";

// Un SourceBuffer accetta un solo append/remove alla volta: prima di ogni
// nuova operazione bisogna aspettare che quella in corso finisca, altrimenti
// appendBuffer/remove lanciano un InvalidStateError.
export function attendiUpdateEnd(sb) {
  if (!sb.updating) return Promise.resolve();
  return new Promise(resolve => sb.addEventListener("updateend", resolve, { once: true }));
}

// Libera il buffer già superato dal playhead (mai oltre, altrimenti si
// cancellerebbe quello che sta per essere riprodotto): tenerlo tutto
// servirebbe solo per un riavvolgimento indietro, raro rispetto al costo di
// tenerlo in RAM — specie su un 4K, dove un minuto di buffer sono già
// centinaia di MB.
export async function liberaDietro(sb, video) {
  const limite = video.currentTime - MSE_EVICT_BEHIND_S;
  if (limite <= 0 || !sb.buffered.length) return;
  const inizio = sb.buffered.start(0);
  if (inizio >= limite) return;
  await attendiUpdateEnd(sb);
  sb.remove(inizio, limite);
  await attendiUpdateEnd(sb);
}

// Append che non si arrende alla prima `QuotaExceededError` (memoria piena):
// libera il buffer già visto e ritenta una volta sola — se fallisce ancora,
// l'eccezione sale a chi chiama (msePump la tratta come errore vero, non c'è
// altro da liberare in sicurezza).
export async function appendiConQuota(sb, chunk, video) {
  await attendiUpdateEnd(sb);
  try {
    sb.appendBuffer(chunk);
  } catch (e) {
    if (e.name !== "QuotaExceededError") throw e;
    await liberaDietro(sb, video);
    await attendiUpdateEnd(sb);
    sb.appendBuffer(chunk);
  }
  await attendiUpdateEnd(sb);
}

// Range di `buffered` che contiene `t`, o null. Serve alla barra di
// avanzamento (sostituisce `isBuffered` di videoPlayerHelpers.js, che vale
// solo per il ripiego <video src>: con MSE `buffered` lo riempiamo noi, è
// già affidabile).
export function intervalloAt(buffered, t) {
  for (let i = 0; i < buffered.length; i++) {
    if (t >= buffered.start(i) && t <= buffered.end(i)) return [buffered.start(i), buffered.end(i)];
  }
  return null;
}
