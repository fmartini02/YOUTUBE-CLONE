export const CATEGORIES = ["Tutti", "Musica", "Gaming", "Notizie", "Sport", "Film", "Cucina", "Tecnologia"];
export const PAGE_SIZE = 24;

// La home mostra SOLO le raccomandazioni personali. Quando mancano, il motivo
// è sempre la sessione YouTube: meglio dire quale dei tre casi è, perché la
// cosa da fare cambia.
export const EMPTY_MESSAGES = {
  "no-cookies": {
    title: "Nessun cookie YouTube caricato",
    body: "Le raccomandazioni personali esistono solo per un account loggato. Importa i cookie dal browser in Impostazioni.",
  },
  "not-logged-in": {
    title: "I cookie non contengono una sessione YouTube",
    body: "Essere loggati su Google non basta: apri youtube.com nel browser, controlla di essere loggato, poi reimporta i cookie da Impostazioni.",
  },
  "feed-vuoto": {
    title: "YouTube non ha restituito raccomandazioni",
    body: "Di solito significa che la sessione è scaduta. Reimporta i cookie da Impostazioni e ricarica.",
  },
  errore: {
    title: "Errore nel caricamento della home",
    body: "Il server non ha risposto. Controlla che sia attivo e riprova.",
  },
};
