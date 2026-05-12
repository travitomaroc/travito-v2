export default function SearchHeader() {
  return (
    <header style={{
      background: "#fff",
      borderBottom: "1px solid #eee",
      padding: "14px 24px",
      display: "flex",
      gap: 16,
      alignItems: "center",
      position: "sticky",
      top: 0,
      zIndex: 10
    }}>
      <strong style={{ fontSize: 24, color: "#f36b21" }}>Travito</strong>

      <input
        placeholder="Que cherchez-vous ?"
        style={{
          flex: 1,
          padding: "14px 16px",
          borderRadius: 999,
          border: "1px solid #ddd",
          fontSize: 16
        }}
      />

      <button style={{
        padding: "14px 22px",
        borderRadius: 999,
        border: 0,
        background: "#f36b21",
        color: "#fff",
        fontWeight: 700
      }}>
        Rechercher
      </button>
    </header>
  );
}