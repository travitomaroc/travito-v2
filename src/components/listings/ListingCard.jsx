export default function ListingCard({ listing }) {
  return (
    <article
      style={{
        border: "1px solid #e5e5e5",
        borderRadius: 16,
        overflow: "hidden",
        background: "#fff",
      }}
    >
      <div
        style={{
          height: 180,
          background: "#f1f1f1",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          color: "#666",
        }}
      >
        Photo
      </div>

      <div style={{ padding: 14 }}>
        <div
          style={{
            fontSize: 13,
            color: "#777",
            marginBottom: 8,
            textTransform: "capitalize",
          }}
        >
          {listing.category}
        </div>

        <h3
          style={{
            margin: 0,
            fontSize: 18,
            lineHeight: 1.4,
          }}
        >
          {listing.title}
        </h3>

        <p
          style={{
            marginTop: 10,
            marginBottom: 14,
            color: "#666",
            fontSize: 14,
          }}
        >
          {listing.city}
          {listing.neighborhood
            ? ` • ${listing.neighborhood}`
            : ""}
        </p>

        <strong
          style={{
            fontSize: 20,
          }}
        >
          {listing.price.toLocaleString()} {listing.currency}
        </strong>
      </div>
    </article>
  );
}