import { Section, PrefRow, PrefToggle } from "./settingsShared";

const QUALITY_OPTIONS = [
  { value: "best", label: "Migliore disponibile" },
  { value: "1080", label: "1080p" },
  { value: "720", label: "720p" },
  { value: "480", label: "480p" },
  { value: "360", label: "360p" },
];
const THEME_OPTIONS = [
  { value: "dark", label: "Scuro" },
  { value: "light", label: "Chiaro" },
  { value: "auto", label: "Come il sistema" },
];

/**
 * Le preferenze vivono nel context (usePrefs), non nello stato locale della
 * pagina: da lì le leggono anche il player (qualità, autoplay) e il tema.
 */
export default function PreferencesSection({ prefs, salvaPrefs }) {
  return (
    <Section title="Preferenze" icon="🎛️">
      <PrefRow label="Qualità video predefinita" value={prefs.quality || "best"} options={QUALITY_OPTIONS} onChange={v => salvaPrefs({ quality: v })} />
      <PrefRow label="Tema" value={prefs.theme || "dark"} options={THEME_OPTIONS} onChange={v => salvaPrefs({ theme: v })} />
      <PrefToggle
        label="Autoplay video" sublabel="Fa partire da solo un video appena aperto"
        value={prefs.autoplay !== false} onChange={v => salvaPrefs({ autoplay: v })}
      />
    </Section>
  );
}
