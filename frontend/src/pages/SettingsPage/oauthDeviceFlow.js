import { api } from "../../api";

// Device flow: il server chiede un codice a Google, l'utente lo digita su
// google.com/device da dove gli pare, noi intanto chiediamo se ha finito.
// Nessun redirect, quindi funziona identico col server su un altro computer.

async function pollDeviceOnce(deviceCode, pollRef, setters, addToast) {
  try {
    const res = await api.devicePoll(deviceCode);
    if (res.status === "ok") {
      clearInterval(pollRef.current);
      setters.setDevice(null);
      setters.setOauthStep("done");
      addToast("✅ Account collegato!");
      await setters.loadStatus();
    } else if (res.status === "error") {
      clearInterval(pollRef.current);
      setters.setDevice(null);
      setters.setOauthStep("idle");
      addToast("❌ " + res.message);
    }
    // authorization_pending / slow_down: l'utente non ha ancora finito.
  } catch { /* riprova al giro successivo */ }
}

function startPolling(deviceCode, interval, pollRef, setters, addToast) {
  clearInterval(pollRef.current);
  pollRef.current = setInterval(() => pollDeviceOnce(deviceCode, pollRef, setters, addToast), interval);
}

export async function startOAuthImpl(clientId, clientSecret, pollRef, setters, addToast) {
  if (!clientId || !clientSecret) {
    addToast("⚠️ Inserisci Client ID e Client Secret");
    return;
  }
  try {
    const d = await api.deviceStart(clientId, clientSecret);
    setters.setDevice(d);
    setters.setOauthStep("waiting");
    // Il popup può essere bloccato: il codice e il link restano comunque a video.
    window.open(d.verification_url, "_blank");
    startPolling(d.device_code, (d.interval || 5) * 1000, pollRef, setters, addToast);
  } catch (e) {
    addToast("❌ Errore: " + e.message);
  }
}

export async function logoutImpl(pollRef, setters, addToast) {
  await api.logout();
  clearInterval(pollRef.current);
  setters.setDevice(null);
  setters.setOauthStep("idle");
  await setters.loadStatus();
  addToast("Account disconnesso");
}
