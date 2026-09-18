/**
 * Registro dei "gestori" del tasto Indietro di Android.
 *
 * Il tasto arriva a `useBackButton` (uno solo, in cima all'app), ma chi sa
 * davvero se c'è qualcosa da chiudere è il componente che lo ha aperto — il
 * pannello della descrizione, e domani qualsiasi altro pannello a comparsa.
 * Passare quello stato fino in cima avrebbe voluto dire un prop nuovo per ogni
 * pannello, attraverso pagine che non c'entrano nulla: qui invece ogni
 * pannello si registra da sé mentre è aperto e si toglie quando si chiude.
 *
 * È stato a livello di modulo, non un context: non deve far ri-renderizzare
 * niente (lo si legge solo dentro l'handler del tasto) e i pannelli aperti
 * insieme sono al massimo un paio.
 */

// Pila: l'ultimo registrato è quello visivamente in cima, quindi il primo a
// doversi chiudere.
const pila = [];

/** Registra `fn` finché il pannello è aperto. `fn()` → true se ha chiuso qualcosa. */
export function pushBackHandler(fn) {
  pila.push(fn);
}

/** Toglie `fn` (l'ultima registrazione, se per un errore ce ne fosse più d'una). */
export function popBackHandler(fn) {
  const i = pila.lastIndexOf(fn);
  if (i >= 0) pila.splice(i, 1);
}

/**
 * Dà il tasto Indietro al gestore più in alto. Se quello dichiara di non aver
 * fatto niente si prova con quello sotto: un pannello può restare registrato
 * un istante in più del necessario, e in quel caso il tasto non deve sparire
 * nel nulla.
 */
export function handleBack() {
  for (let i = pila.length - 1; i >= 0; i--) {
    if (pila[i]()) return true;
  }
  return false;
}
