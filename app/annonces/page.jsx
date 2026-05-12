export default function AnnoncesPage() {
  return (
    <main style={{ padding: "24px", fontFamily: "Arial, sans-serif" }}>
      <h1>Annonces</h1>

      <section style={{ display: "flex", gap: 16, marginTop: 24 }}>
        <aside style={{ width: 280, border: "1px solid #ddd", padding: 16 }}>
          <h3>Filtres</h3>
          <p>Catégorie</p>
          <p>Ville</p>
          <p>Prix</p>
          <p>Avec photo</p>
        </aside>

        <section style={{ flex: 1 }}>
          <div style={{ marginBottom: 16 }}>
            <strong>Résultats</strong>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 16
          }}>
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <article
                key={item}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 12,
                  overflow: "hidden",
                  background: "#fff"
                }}
              >
                <div style={{
                  height: 160,
                  background: "#eee",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}>
                  Photo
                </div>

                <div style={{ padding: 12 }}>
                  <h3 style={{ margin: "0 0 8px" }}>Annonce exemple</h3>
                  <p style={{ margin: 0 }}>Casablanca</p>
                  <strong>120 000 DH</strong>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}