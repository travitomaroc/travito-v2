import ListingCard from "../../src/components/listings/ListingCard";
import { listings } from "../../src/data/seed/listings";
import FilterSidebar from "../../src/components/filters/FilterSidebar";

export default function AnnoncesPage() {
  return (
    <main
      style={{
        padding: 24,
        fontFamily: "Arial, sans-serif",
        background: "#fafafa",
        minHeight: "100vh",
      }}
    >
      <h1 style={{ marginBottom: 24 }}>
        Annonces
      </h1>

      <section
        style={{
          display: "flex",
          gap: 24,
          alignItems: "flex-start",
        }}
      >
<FilterSidebar />

        <section style={{ flex: 1 }}>
          <div
            style={{
              marginBottom: 20,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <strong>
              {listings.length} résultats
            </strong>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 20,
            }}
          >
            {listings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
              />
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}