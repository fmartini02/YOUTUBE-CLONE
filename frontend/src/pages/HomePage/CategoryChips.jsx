import { CATEGORIES } from "./homeMessages";

export default function CategoryChips({ category, setCategory }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
      <div className="filter-chips" style={{ marginBottom: 0 }}>
        {CATEGORIES.map(c => (
          <button key={c} className={`chip${category === c ? " active" : ""}`} onClick={() => setCategory(c)}>
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}
