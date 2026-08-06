import { useState, useEffect } from "react";

/**
 * Media query come stato React.
 *
 * Serve dove il CSS da solo non basta: il comportamento (non solo l'aspetto)
 * cambia fra desktop e telefono — la barra laterale che si chiude da sola dopo
 * aver scelto una voce, il player che sul touch conta i tocchi invece dei
 * click. Le soglie stanno qui e in App.css e devono restare uguali.
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();   // la query può essere cambiata fra il primo render e qui
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** Sotto questa larghezza la barra laterale è un pannello a scomparsa. */
export const MOBILE_QUERY = "(max-width: 900px)";
export function useMobileLayout() { return useMediaQuery(MOBILE_QUERY); }

/**
 * Dito invece di mouse. Non è la larghezza dello schermo a decidere: una
 * finestra stretta sul PC ha comunque un puntatore preciso e l'hover, un
 * tablet largo no.
 */
export const TOUCH_QUERY = "(hover: none) and (pointer: coarse)";
export function useTouchDevice() { return useMediaQuery(TOUCH_QUERY); }
