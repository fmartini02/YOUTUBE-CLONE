import { api } from "../../api";
import { Section } from "./settingsShared";
import AuthenticatedAccount from "./AuthenticatedAccount";
import UnauthenticatedAccount from "./UnauthenticatedAccount";

async function handleSync(loadStatus, addToast) {
  addToast("🔄 Sincronizzazione in corso...");
  try {
    const res = await api.syncSubs();
    addToast(`✅ ${res.subscriptions.length} canali sincronizzati`);
    await loadStatus();
  } catch (e) {
    addToast("❌ Errore sync: " + e.message);
  }
}

export default function AccountSection({ oauth, addToast }) {
  return (
    <Section title="Account Google" icon="🔑">
      {oauth.status?.authenticated ? (
        <AuthenticatedAccount
          status={oauth.status}
          onSync={() => handleSync(oauth.loadStatus, addToast)}
          onLogout={oauth.handleLogout}
        />
      ) : (
        <UnauthenticatedAccount
          clientId={oauth.clientId} setClientId={oauth.setClientId}
          clientSecret={oauth.clientSecret} setClientSecret={oauth.setClientSecret}
          oauthStep={oauth.oauthStep} device={oauth.device} startOAuth={oauth.startOAuth} addToast={addToast}
        />
      )}
    </Section>
  );
}
