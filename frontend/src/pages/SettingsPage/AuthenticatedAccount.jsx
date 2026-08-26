import { timeAgo } from "../../api";
import { StatusRow } from "./settingsShared";

export default function AuthenticatedAccount({ status, onSync, onLogout }) {
  return (
    <div>
      <StatusRow icon="✅" label="Account collegato" sublabel={`${status.subscription_count} canali iscritti`} color="var(--green)" />
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button className="action-btn" onClick={onSync}>🔄 Sincronizza ora</button>
        <button className="action-btn" onClick={onLogout}>🚪 Disconnetti</button>
      </div>
      {status.sync?.last_sync > 0 && (
        <p style={{ fontSize: 12, color: "var(--text3)", marginTop: 8 }}>
          Ultimo sync: {timeAgo(status.sync.last_sync)} • prossimo tra ~1 ora
        </p>
      )}
    </div>
  );
}
