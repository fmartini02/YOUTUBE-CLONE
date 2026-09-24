import { Section, PrefRow, PrefToggle } from "./settingsShared";
import { CATEGORIE_SPONSOR, AZIONI_SPONSOR, azioniSponsor } from "../../components/VideoPlayer/sponsorBlock";

// Nome della categoria con il suo colore sulla barra del player, così la
// legenda si impara qui una volta.
function EtichettaCategoria({ categoria }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 10, height: 10, borderRadius: 2, background: categoria.colore, flexShrink: 0 }} />
      {categoria.nome}
    </span>
  );
}

/**
 * SponsorBlock: sì/no e, per ogni categoria, cosa fa il player. Si salva
 * l'intera mappa categoria → azione (default compresi, vedi azioniSponsor):
 * un PATCH con una sola voce la sostituirebbe a tutta la mappa sul server.
 */
export default function SponsorBlockSection({ prefs, salvaPrefs }) {
  const attivo = prefs.sponsorBlock !== false;
  const azioni = azioniSponsor({ ...prefs, sponsorBlock: true });
  return (
    <Section title="SponsorBlock" icon="⏭️">
      <PrefToggle
        label="Salta le sponsorizzazioni"
        sublabel="Segmenti segnalati dalla comunità di SponsorBlock (sponsor.ajay.app), chiesti dal server senza rivelare quale video guardi"
        value={attivo} onChange={v => salvaPrefs({ sponsorBlock: v })}
      />
      {attivo && CATEGORIE_SPONSOR.map(c => (
        <PrefRow
          key={c.id} label={<EtichettaCategoria categoria={c} />} value={azioni[c.id]} options={AZIONI_SPONSOR}
          onChange={v => salvaPrefs({ sponsorCategories: { ...azioni, [c.id]: v } })}
        />
      ))}
    </Section>
  );
}
