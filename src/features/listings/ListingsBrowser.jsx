"use client";

import { useState } from "react";
import ListingCard from "../../components/listings/ListingCard";
import FilterSidebar from "../../components/filters/FilterSidebar";
import { listings } from "../../data/seed/listings";

export default function ListingsBrowser() {
  const [selectedCategory, setSelectedCategory] = useState(null);

  const filteredListings = selectedCategory
    ? listings.filter((listing) => listing.category === selectedCategory)
    : listings;

  return (
    <section
      style={{
        display: "flex",
        gap: 24,
        alignItems: "flex-start",
      }}
    >
      <FilterSidebar
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
      />

      <section style={{ flex: 1 }}>
        <div style={{ marginBottom: 20 }}>
          <strong>{filteredListings.length} résultats</strong>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 20,
          }}
        >
          {filteredListings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      </section>
    </section>
  );
}