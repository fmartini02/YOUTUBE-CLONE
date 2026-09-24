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
// Una volta che il primo doppio tocco ha già avviato un salto (vedi
// `onVideoPointerUp` in index.jsx), i tocchi SUCCESSIVI dello stesso gesto
// hanno più margine: chi ha appena fatto un doppio tocco veloce e prova a
// continuare con un terzo/quarto tocco non lo ripete quasi mai alla stessa
// cadenza — misurato: senza margine in più, la somma si fermava ai primi due
// tocchi (20s) perché il terzo arrivava oltre i 300ms e veniva scambiato per
// l'inizio di un tocco singolo nuovo, subito annullato dal quarto. Vale SOLO
// per continuare un salto già iniziato, non per la prima coppia (quella resta
// su DOUBLE_TAP_MS, il compromesso sopra spiegato non cambia).
export const SEEK_BURST_MS = 500;
// Oltre questa distanza il dito stava scorrendo la pagina, non toccando il
// video: senza il controllo, ogni scorrimento partito dal player lo metteva
// in pausa.
export const TAP_SLOP_PX = 12;
// Terzo sinistro e terzo destro saltano avanti/indietro; la fascia centrale no,
// altrimenti un doppio tocco al centro (dove si mira per la pausa) muoverebbe
// il video invece di fermarlo.
export const TAP_SIDE_RATIO = 0.35;

// --- MediaSource (vedi mseStream.js/msePump.js) ---
// Quanto tenersi avanti alla posizione attuale prima di fermare il download:
// senza un tetto, un video intero (specie un 4K) finirebbe tutto in RAM.
export const MSE_TARGET_AHEAD_S = 60;
// Sotto questa distanza dietro al playhead si libera il buffer già visto:
// tenerlo servirebbe solo per un riavvolgimento indietro, raro rispetto al
// costo di tenerlo in memoria.
export const MSE_EVICT_BEHIND_S = 30;
// Non un `appendBuffer` per ogni chunk di rete (spesso pochi KB): si accumula
// fino a questa soglia, perché ogni append ha un costo fisso non
// trascurabile se ripetuto troppo spesso.
export const MSE_CHUNK_MIN_BYTES = 65536;
// Intervallo del polling "c'è spazio per scaricare ancora?" in msePump.js.
export const MSE_POLL_MS = 400;
// Stesso polling, ma quando il video è in pausa: un utente fermo su un video
// per ore (proprio il caso che il buffering-mentre-in-pausa doveva risolvere)
// non ha bisogno di un controllo ogni 400ms — un intervallo più largo evita
// di tenere un timer JS a girare in continuazione senza motivo.
export const MSE_POLL_MS_PAUSA = 5000;
// Tetto d'attesa per l'evento `sourceopen` in mseStream.js: in un browser che
// lo supporta normalmente arriva quasi subito dopo `video.load()`, ma un caso
// patologico (tab sospesa, bug del browser) potrebbe non farlo arrivare mai —
// senza un tetto l'apertura del flusso resterebbe appesa per sempre invece di
// ripiegare su <video src>.
export const MSE_SOURCEOPEN_TIMEOUT_MS = 5000;
// Quanto vicino alla durata deve stare la posizione perché un `ended` valga
// come fine vera (onEnded del player → video successivo della playlist). Un
// flusso chiuso per rinuncia dopo gli errori di rete finisce a metà.
export const FINE_VERA_S = 3;
