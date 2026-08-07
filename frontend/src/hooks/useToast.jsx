import { useState, useCallback, useRef, useEffect } from "react";

export function useToast() {
  const [toasts, setToasts] = useState([]);
  // Contatore invece di Date.now(): due toast nello stesso millisecondo
  // (succede davvero — un'azione che ne mostra due di fila) avevano la stessa
  // chiave, e React ne disegnava uno solo. Il timer del primo poi cancellava
  // anche il secondo.
  const nextId = useRef(0);
  // I timer vanno annullati se il componente sparisce prima della scadenza,
  // altrimenti setToasts viene chiamato su un componente smontato.
  const timers = useRef([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const addToast = useCallback((msg, duration = 3000) => {
    const id = ++nextId.current;
    setToasts(t => [...t, { id, msg }]);
    const timer = setTimeout(() => {
      setToasts(t => t.filter(x => x.id !== id));
      timers.current = timers.current.filter(x => x !== timer);
    }, duration);
    timers.current.push(timer);
  }, []);

  // Dichiarato una volta sola, non ad ogni render: essendo un componente
  // ricreato ogni volta, React lo considerava un tipo diverso e smontava e
  // rimontava i toast ad ogni aggiornamento della pagina — l'animazione di
  // entrata ripartiva da capo mentre il toast era già a schermo.
  const ToastContainer = useCallback(() => (
    <div className="toast-container">
      {toasts.map(t => <div key={t.id} className="toast">{t.msg}</div>)}
    </div>
  ), [toasts]);

  return { addToast, ToastContainer };
}
