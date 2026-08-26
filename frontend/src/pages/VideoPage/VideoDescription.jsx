import { formatViews, formatDate } from "../../api";

export default function VideoDescription({ info, expanded, setExpanded }) {
  if (!info.description) return null;
  return (
    <div className={`description-box${expanded ? " expanded" : ""}`} onClick={() => setExpanded(e => !e)}>
      <span style={{ fontSize: 12, color: "var(--text3)", marginBottom: 6, display: "block" }}>
        {formatDate(info.published)} • {formatViews(info.views)}
      </span>
      {info.description}
      {!expanded && <span style={{ color: "var(--text2)" }}> ... mostra altro</span>}
    </div>
  );
}
