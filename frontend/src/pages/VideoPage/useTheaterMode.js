import { useState } from "react";

const THEATER_KEY = "ytproxy_theater";

/** Modalità cinema: la scelta vale per tutti i video, come su YouTube, quindi sopravvive al cambio pagina e al riavvio. */
export function useTheaterMode() {
  const [theater, setTheater] = useState(() => localStorage.getItem(THEATER_KEY) === "1");
  const toggleTheater = () => setTheater(t => {
    localStorage.setItem(THEATER_KEY, t ? "0" : "1");
    return !t;
  });
  return [theater, toggleTheater];
}
