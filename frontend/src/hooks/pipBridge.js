import { registerPlugin } from "@capacitor/core";
import { isCapacitor } from "../api/device";

/**
 * Canale con il Picture-in-Picture di Android (PipPlugin.java). Sul web non fa
 * niente: `registerPlugin` torna un proxy che lancia appena lo si chiama, quindi
 * ogni funzione qui controlla prima `isCapacitor()` — come per YtCast.
 *
 * I comandi play/pausa che arrivano dalla finestra PiP vanno al player montato,
 * che si registra qui (un solo player alla volta: modulo, non context — nessuno
 * deve ri-renderizzare quando cambiano, come in App/backHandlers.js).
 */
const YtPip = registerPlugin("YtPip");
let comandi = null;

/** { attivo, playing, w, h }: se c'è un player e se sta andando, più le dimensioni del video. */
export function inviaStatoPip(stato) {
  if (!isCapacitor()) return;
  YtPip.setStato(stato).catch(() => {});
}

/** `c` = { play, pause }. Restituisce la funzione che lo toglie (solo se è ancora lui). */
export function registraComandiPip(c) {
  comandi = c;
  return () => { if (comandi === c) comandi = null; };
}

export function eseguiComandoPip(azione) {
  if (azione === "play") comandi?.play();
  else if (azione === "pause") comandi?.pause();
}

/** Ascolta un evento del plugin ("pipModo", "pipAzione"). Restituisce la funzione che smette. */
export function ascoltaPip(evento, cb) {
  if (!isCapacitor()) return () => {};
  const handle = YtPip.addListener(evento, cb);
  return () => { Promise.resolve(handle).then(h => h.remove()).catch(() => {}); };
}

/** { pip: bool } — stato vero della finestra, o null fuori dall'APK / se il plugin non risponde. */
export function leggiStatoPip() {
  return isCapacitor() ? YtPip.getStato().catch(() => null) : Promise.resolve(null);
}
