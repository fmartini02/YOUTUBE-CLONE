import { usePrefs } from "../../hooks/usePrefs";
import { useToast } from "../../hooks/useToast";
import { useOAuthFlow } from "./useOAuthFlow";
import { useCookieManagement } from "./useCookieManagement";
import { Section } from "./settingsShared";
import CastDiagnostics from "./CastDiagnostics";
import ServerSection from "./ServerSection";
import ChromecastGuideSection from "./ChromecastGuideSection";
import AccountSection from "./AccountSection";
import CookiesSection from "./CookiesSection";
import PreferencesSection from "./PreferencesSection";
import HistorySection from "./HistorySection";

export default function SettingsPage({ navigate }) {
  const { prefs, salvaPrefs } = usePrefs();
  const { addToast, ToastContainer } = useToast();
  const oauth = useOAuthFlow(addToast);
  const cookies = useCookieManagement(oauth.loadStatus, addToast);

  return (
    <div style={{ maxWidth: 700, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>⚙️ Impostazioni</h1>

      <Section title="Diagnostica Chromecast" icon="🩺">
        <CastDiagnostics />
      </Section>
      <ServerSection />
      <ChromecastGuideSection />
      <AccountSection oauth={oauth} addToast={addToast} />
      <CookiesSection status={oauth.status} cookies={cookies} />
      <PreferencesSection prefs={prefs} salvaPrefs={salvaPrefs} />
      <HistorySection navigate={navigate} addToast={addToast} />

      <ToastContainer />
    </div>
  );
}
