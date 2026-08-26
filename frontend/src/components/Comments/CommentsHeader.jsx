import { formatCompact } from "../../api";

export default function CommentsHeader({ count, sort, setSort, showSort }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600 }}>
        Commenti {count != null && <span style={{ color: "var(--text3)", fontWeight: 400 }}>({formatCompact(count)})</span>}
      </h3>
      {showSort && (
        <select className="quality-select" value={sort} onChange={e => setSort(e.target.value)}>
          <option value="top">Più pertinenti</option>
          <option value="new">Più recenti</option>
        </select>
      )}
    </div>
  );
}
