import ListingCard from "../../src/components/listings/ListingCard";
import { listings } from "../../src/data/seed/listings";

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

          <div style={{ marginTop: 20 }}>
            <p>Catégorie</p>
            <p>Ville</p>
            <p>Prix</p>
            <p>Avec photo</p>
          </div>
        </aside>

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