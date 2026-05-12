import { categories, commonFilters } from "../../data/seed/taxonomy";

export default function FilterSidebar({
  selectedCategory,
  onSelectCategory,
}) { 
  return (
    <aside
      style={{
        width: 280,
        background: "#fff",
        border: "1px solid #e5e5e5",
        borderRadius: 16,
        padding: 20,
        position: "sticky",
        top: 20,
      }}
    >
      <h3>Filtres</h3>

      {commonFilters.map((filter) => (
        <div key={filter.key} style={{ marginTop: 18 }}>
          <strong>{filter.label}</strong>
        </div>
      ))}

      <div style={{ marginTop: 24 }}>
        <strong>Catégories</strong>

        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          {categories.map((category) => (
<button
  key={category.slug}
  onClick={() =>
    onSelectCategory(
      selectedCategory === category.slug ? null : category.slug
    )
  }
  style={{
    textAlign: "left",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background:
      selectedCategory === category.slug ? "#ffefe5" : "#fafafa",
    cursor: "pointer",
  }}
>
              {category.label}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}