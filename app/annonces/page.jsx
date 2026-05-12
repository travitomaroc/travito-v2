import ListingsBrowser from "../../src/features/listings/ListingsBrowser";
import SearchHeader from "../../src/components/layout/SearchHeader";

export default function AnnoncesPage() {
  return (

<>
  <SearchHeader />
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
</>

  );
}