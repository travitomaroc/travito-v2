"use client";

import { useMemo, useState } from "react";

import FilterSidebar from "../../components/filters/FilterSidebar";
import ListingGrid from "../../components/listings/ListingGrid";

import { listings } from "../../data/seed/listings";

export default function ListingsBrowser({
  categories,
}) {
  const [selectedCategory, setSelectedCategory] =
    useState(null);

  const filteredListings = useMemo(() => {
    if (!selectedCategory) return listings;

    return listings.filter(
      (listing) =>
        listing.category === selectedCategory
    );
  }, [selectedCategory]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "280px 1fr",
        gap: 20,
        alignItems: "start",
      }}
    >
      <FilterSidebar
        categories={categories}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
      />

      <div>
        <div
          style={{
            marginBottom: 18,
            fontWeight: 700,
          }}
        >
          {filteredListings.length} résultats
        </div>

        <ListingGrid listings={filteredListings} />
      </div>
    </div>
  );
}