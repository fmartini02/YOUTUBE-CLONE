import { useState, useEffect, useRef } from "react";
import { api } from "../../api";

const PAGINA = 50;
// Aprendo /watch?v=…&list=… il video può stare in fondo a una playlist lunga:
// si caricano pagine finché non lo si trova, ma non oltre questo tetto (un
// id che nella playlist non c'è la farebbe scaricare tutta, fino a 5000 video).
const MAX_PAGINE = 20;
const VUOTA = { listId: null, playlist: null, videos: [], hasMore: false, loading: false };

/**
 * Carica pagine della playlist, a partire da `base` (quello che si ha già),
 * finché `basta(videos)` non è vero o la playlist finisce. Aggiorna lo stato
 * a ogni pagina, così il pannello si riempie mentre cerca. Restituisce i video.
 */
async function caricaFinche(listId, basta, base, annullato, setCoda) {
  let { playlist, videos, hasMore } = base || { playlist: null, videos: [], hasMore: true };
  setCoda(c => ({ ...(base ? c : VUOTA), listId, loading: true }));
  try {
    for (let pagine = 0; hasMore && pagine < MAX_PAGINE && !(videos.length && basta(videos)); pagine++) {
      const d = await api.playlist(listId, PAGINA, videos.length);
      if (annullato()) return videos;
      const visti = new Set(videos.map(v => v.id));
      videos = [...videos, ...(d.results || []).filter(v => !visti.has(v.id))];
      playlist = d.playlist || playlist;
      hasMore = !!d.has_more;
      setCoda({ listId, playlist, videos, hasMore, loading: true });
    }
  } catch {
    hasMore = false;
  }
  if (!annullato()) setCoda({ listId, playlist, videos, hasMore, loading: false });
  return videos;
}

// Il video dopo `videoId`, caricando la pagina successiva se è l'ultimo
// caricato. null se la playlist è finita o il video non ci sta (ancora).
async function prossimoDi(videoId, codaRef, setCoda) {
  const c = codaRef.current;
  const i = c.videos.findIndex(v => v.id === videoId);
  if (i < 0) return null;
  if (i + 1 < c.videos.length) return c.videos[i + 1];
  if (!c.hasMore || c.loading) return null;
  const videos = await caricaFinche(c.listId, v => v.length > i + 1, c, () => false, setCoda);
  return videos[i + 1] || null;
}

/**
 * La playlist in cui si sta guardando il video (`listId`, dal `&list=`
 * dell'URL): i video per il pannello, la posizione di quello corrente, il
 * successivo per l'avanzamento automatico. Cambiando video dentro la stessa
 * playlist non si ricarica niente: si cerca solo, se serve, più avanti.
 */
export function usePlaylistQueue(listId, videoId) {
  const [coda, setCoda] = useState(VUOTA);
  const codaRef = useRef(coda);
  codaRef.current = coda;
  // Un caricamento resta valido finché la playlist è la stessa, anche se nel
  // frattempo cambia il video: annullarlo al cambio di video (la pulizia di un
  // effect) lascerebbe `loading` acceso per sempre, e più nessuno caricherebbe.
  const listRef = useRef(listId);
  listRef.current = listId;
  const superato = id => () => listRef.current !== id;

  useEffect(() => {
    if (!listId) { setCoda(VUOTA); return; }
    const c = codaRef.current;
    const stessa = c.listId === listId;
    if (stessa && (c.loading || c.videos.some(v => v.id === videoId) || !c.hasMore)) return;
    caricaFinche(listId, v => v.some(x => x.id === videoId), stessa ? c : null, superato(listId), setCoda);
  }, [listId, videoId]); // eslint-disable-line react-hooks/exhaustive-deps

  const caricaAltri = () => {
    const c = codaRef.current;
    if (!c.hasMore || c.loading || c.listId !== listId) return;
    const n = c.videos.length;
    caricaFinche(listId, v => v.length > n, c, superato(listId), setCoda);
  };
  const attiva = !!listId && coda.listId === listId;
  const indice = attiva ? coda.videos.findIndex(v => v.id === videoId) : -1;
  return { ...coda, attiva, indice, caricaAltri, prossimo: () => prossimoDi(videoId, codaRef, setCoda) };
}

/**
 * Avanzamento automatico a fine video, dentro una playlist.
 *
 * A pagina intera è un navigate verso il video successivo, che dalla pagina
 * video SOSTITUISCE la voce di cronologia (App/navHistory.js) — come verso un
 * correlato. Nel widget cambia solo il video del widget (`onAdvanceMini`):
 * un navigate lo riporterebbe a pagina intera.
 *
 * Il video raggiunto così parte da solo anche con la preferenza "Autoplay"
 * spenta (`autoplayForzato`): quella decide per i video aperti a mano, e una
 * playlist che si ferma a ogni video non sarebbe una riproduzione in sequenza.
 */
export function usePlaylistPlayback(listId, videoId, { mini, navigate, onAdvanceMini }) {
  const coda = usePlaylistQueue(listId, videoId);
  const [avviatoDaCoda, setAvviatoDaCoda] = useState(null);

  const alTermine = async () => {
    if (!coda.attiva) return;
    const n = await coda.prossimo();
    if (!n) return;
    setAvviatoDaCoda(n.id);
    if (mini) onAdvanceMini?.(n.id, listId);
    else navigate("video", { videoId: n.id, listId });
  };
  return { coda, alTermine, autoplayForzato: avviatoDaCoda === videoId };
}
