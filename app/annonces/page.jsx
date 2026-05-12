import ListingsBrowser from "../../src/features/listings/ListingsBrowser";

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
      <h1 style={{ marginBottom: 24 }}>Annonces</h1>
      <ListingsBrowser />
    </main>
  );
}