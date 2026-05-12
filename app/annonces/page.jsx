"use client";

import { useMemo, useState } from "react";

import Header from "../../src/components/layout/Header";
import FilterSidebar from "../../src/components/filters/FilterSidebar";
import ListingGrid from "../../src/components/listings/ListingGrid";

import { listings } from "../../src/data/seed/listings";

export default function AnnoncesPage() {
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
    <>
      <Header />

      <main
        style={{
          maxWidth: 1800,
          margin: "0 auto",
          padding: "20px",
        }}
      >
        <div
          style={{
            fontSize: 13,
            marginBottom: 20,
            color: "#777",
          }}
        >
          Accueil › Résultats de la recherche
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "280px 1fr",
            gap: 20,
            alignItems: "start",
          }}
        >
          <FilterSidebar
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
      </main>
    </>
  );
}