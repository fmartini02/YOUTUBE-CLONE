// Costanti condivise fra il player e i pezzi di UI che ne dipendono (barra
// pulsanti, gesti sullo schermo). Isolate qui perché servono a più file.

export const SKIP_SECONDS = 10;
export const VOLUME_STEP = 0.05;

// Quanto buffer avanti alla posizione attuale si aspetta, dopo uno stallo di
// rete, prima di far ripartire da sé la riproduzione (vedi "Recupero da uno
// stallo di rete" in index.jsx). Senza, il browser riparte non appena arriva
// un filo di dati e con una connessione più lenta del bitrate il video va a
// scatti invece di fermarsi una volta sola.
export const REBUFFER_MARGIN_S = 5;

// Quanto si aspetta un secondo tocco prima di dare per buono il primo. È anche
// il ritardo con cui il tocco singolo mette in pausa: sotto i ~250ms i doppi
// tocchi veri sfuggono, sopra i ~400ms il player sembra lento a rispondere.
export const DOUBLE_TAP_MS = 300;
// Oltre questa distanza il dito stava scorrendo la pagina, non toccando il
// video: senza il controllo, ogni scorrimento partito dal player lo metteva
// in pausa.
export const TAP_SLOP_PX = 12;
// Terzo sinistro e terzo destro saltano avanti/indietro; la fascia centrale no,
// altrimenti un doppio tocco al centro (dove si mira per la pausa) muoverebbe
// il video invece di fermarlo.
export const TAP_SIDE_RATIO = 0.35;
