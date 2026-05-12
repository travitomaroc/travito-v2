"use client";

import TaxonomyIcon from "../ui/TaxonomyIcon";

export default function FilterSidebar({
  categories,
  selectedCategory,
  onSelectCategory,
}) {
  return (
    <aside className="filter-sidebar">
      <div className="filter-search">
        <input placeholder="Recherche..." />
        <button>OK</button>
      </div>

      <div className="filter-row">
        <span>Catégorie</span>
        <span>⌄</span>
      </div>

      <div
        style={{
          padding: 14,
          display: "grid",
          gap: 10,
        }}
      >
        {categories.map((category) => {
          const active =
            selectedCategory === category.slug;

          return (
            <button
              key={category.id}
              onClick={() =>
                onSelectCategory(
                  active ? null : category.slug
                )
              }
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                border: active
                  ? "2px solid #f26522"
                  : "1px solid #ddd",
                background: active
                  ? "#fff4ee"
                  : "#fff",
                borderRadius: 10,
                padding: "10px 12px",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <TaxonomyIcon
                src={category.icon}
                alt={category.label}
                active={active}
                size={24}
              />

              <span
                style={{
                  fontWeight: active ? 700 : 500,
                }}
              >
                {category.label}
              </span>
            </button>
          );
        })}
      </div>

      <div className="filter-price">
        <div className="filter-price-title">
          Prix
        </div>

        <div className="price-inputs">
          <input placeholder="Min" />
          <input placeholder="Max" />
        </div>
      </div>

      <div className="toggle-row">
        <div className="toggle-pill" />
        <span>Avec photo</span>
      </div>

      <div className="toggle-row">
        <div className="toggle-pill" />
        <span>Avec prix</span>
      </div>
    </aside>
  );
}