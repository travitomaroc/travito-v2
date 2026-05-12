import Header from "../../src/components/layout/Header";
import ListingsBrowser from "../../src/features/listings/ListingsBrowser";
import { getCategories } from "../../src/features/taxonomy/getCategories";

export default async function AnnoncesPage() {
  const categories = await getCategories();

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

        <ListingsBrowser categories={categories} />
      </main>
    </>
  );
}