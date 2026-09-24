import { useEffect, useRef } from "react";
import { ascoltaPip, eseguiComandoPip, leggiStatoPip } from "../hooks/pipBridge";
import { paramsVideo } from "./navHistory";

// Entrando in PiP la WebView si rimpicciolisce e il player esce dal flusso
// (diventa fixed a tutta finestra): il testo si ridispone e, al ritorno, la
// pagina non sarebbe più al punto di prima. Si ripristina al primo `resize`
// dopo l'uscita — è lì che la WebView torna alla dimensione piena; un solo
// requestAnimationFrame potrebbe arrivare prima. Il timeout copre il caso in
// cui il resize sia già arrivato prima dell'evento di uscita.
function ripristinaScroll(y) {
  let timer = null;
  const vai = () => {
    window.removeEventListener("resize", vai);
    clearTimeout(timer);
    window.scrollTo(0, y);
  };
  window.addEventListener("resize", vai);
  timer = setTimeout(vai, 600);
}

function entra(scroll) {
  scroll.y = window.scrollY;
  document.documentElement.dataset.pip = "1";
}

// Uscita: X ("chiudi") → il video si ferma; Espandi → video a pagina intera,
// ma solo se era nel widget (se si era già sulla sua pagina, un navigate
// aggiungerebbe una voce doppia). `ev` null = uscita scoperta al ritorno in
// primo piano (evento perso): si sistema solo l'aspetto. Il comando di pausa
// viene PRIMA del controllo su data-pip: se l'evento di entrata si fosse
// perso, la X deve comunque fermare il video.
function esci(ev, navRef, scroll) {
  if (ev?.esito === "chiudi") eseguiComandoPip("pause");
  const root = document.documentElement;
  if (!("pip" in root.dataset)) return;
  delete root.dataset.pip;
  const n = navRef.current;
  if (ev?.esito === "espandi" && n.widget && n.page !== "video") {
    n.navigate("video", paramsVideo(n.widget, n.lista));
    return;
  }
  if (scroll.y != null) ripristinaScroll(scroll.y);
}

/**
 * Picture-in-Picture di Android, lato pagina: `data-pip` su <html> (il CSS
 * mostra allora il solo player a tutta finestra, vedi App.css), i pulsanti
 * play/pausa della finestra, X ed Espandi. Fuori dall'APK non ascolta niente.
 */
export function usePipMode(nav) {
  const navRef = useRef(nav);
  navRef.current = nav;
  useEffect(() => {
    const scroll = { y: null };
    const smetti = [
      ascoltaPip("pipModo", ev => (ev.attivo ? entra(scroll) : esci(ev, navRef, scroll))),
      ascoltaPip("pipAzione", ev => eseguiComandoPip(ev.azione)),
    ];
    const alRitorno = () => {
      if (document.visibilityState !== "visible") return;
      leggiStatoPip().then(s => { if (s && !s.pip) esci(null, navRef, scroll); });
    };
    document.addEventListener("visibilitychange", alRitorno);
    return () => { smetti.forEach(f => f()); document.removeEventListener("visibilitychange", alRitorno); };
  }, []);
}
