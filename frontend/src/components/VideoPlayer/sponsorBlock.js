// sponsorBlock.js — categorie SponsorBlock e helper puri del salto automatico.
//
// I segmenti arrivano da /api/sponsorblock/<id> (server/routers/sponsorblock.py,
// che interroga sponsor.ajay.app al posto del browser). Cosa farne lo decide
// l'utente per categoria, nelle Impostazioni: "salta" (il player salta da sé,
// con un avviso e "Annulla"), "mostra" (solo colorato sulla barra, più un
// pulsante per saltarlo a mano), "ignora" (niente).
//
// I default per categoria stanno SOLO qui: il server salva in
// `sponsorCategories` le sole scelte fatte (vedi server/auth/prefs.py), così
// una categoria aggiunta in futuro prende il suo default anche per chi aveva
// già cambiato le altre. Colori: quelli dell'estensione SponsorBlock, così
// chi la conosce ritrova la stessa legenda.
export const CATEGORIE_SPONSOR = [
  { id: "sponsor", nome: "Sponsor", saltato: "Sponsor saltato", colore: "#00d400", predefinita: "salta" },
  { id: "selfpromo", nome: "Autopromozione", saltato: "Autopromozione saltata", colore: "#ffff00", predefinita: "salta" },
  { id: "interaction", nome: "Promemoria di iscrizione", saltato: "Promemoria saltato", colore: "#cc00ff", predefinita: "salta" },
  { id: "intro", nome: "Intro / sigla", saltato: "Intro saltata", colore: "#00ffff", predefinita: "mostra" },
  { id: "outro", nome: "Finale / titoli di coda", saltato: "Finale saltato", colore: "#0202ed", predefinita: "mostra" },
  { id: "preview", nome: "Anteprima / riassunto", saltato: "Anteprima saltata", colore: "#008fd6", predefinita: "mostra" },
  { id: "hook", nome: "Gancio iniziale", saltato: "Gancio saltato", colore: "#395699", predefinita: "ignora" },
  { id: "filler", nome: "Divagazione", saltato: "Divagazione saltata", colore: "#7300ff", predefinita: "ignora" },
  { id: "music_offtopic", nome: "Parte non musicale", saltato: "Parte non musicale saltata", colore: "#ff9900", predefinita: "ignora" },
];

export const AZIONI_SPONSOR = [
  { value: "salta", label: "Salta" },
  { value: "mostra", label: "Mostra solo" },
  { value: "ignora", label: "Ignora" },
];

// Categoria → azione, con i default per quelle mai toccate. `null` se
// SponsorBlock è spento: chi la riceve non chiede nemmeno i segmenti.
export function azioniSponsor(prefs) {
  if (prefs?.sponsorBlock === false) return null;
  const scelte = prefs?.sponsorCategories || {};
  return Object.fromEntries(CATEGORIE_SPONSOR.map(c => [c.id, scelte[c.id] || c.predefinita]));
}

// Dove si arriva davvero saltando il segmento: seekTo non va oltre
// `duration - 0.5` (VideoPlayer/index.jsx), e un'outro che arriva alla fine
// del video finisce lì. È anche il riferimento per dire "salto riuscito".
export function fineUtile(seg, duration) {
  return duration > 0 ? Math.min(seg.end, duration - 0.5) : seg.end;
}

// Il primo segmento con azione `azione` che contiene `t` e che vale ancora la
// pena saltare: serve più di un secondo di guadagno. È questo margine a
// chiudere il ciclo "salta → atterra → ricontrolla → salta": atterrati a
// `fineUtile` (o oltre, sul keyframe del ripiego <video src>, dove la barra
// mostra `start + currentTime`) si è per forza fuori dalla finestra — anche
// con un'outro che finisce oltre la durata, dove la fine vera non si
// raggiunge mai. `esclusi`: gli UUID annullati dall'utente.
export function segmentoIn(segmenti, { azioni, azione, t, duration, esclusi }) {
  if (!azioni) return null;
  return segmenti.find(s =>
    azioni[s.category] === azione && !esclusi?.has(s.uuid) &&
    t >= s.start && t < fineUtile(s, duration) - 1) || null;
}

export function categoriaSponsor(id) {
  return CATEGORIE_SPONSOR.find(c => c.id === id);
}
