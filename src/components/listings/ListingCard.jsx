export default function ListingCard({ listing }) {
  return (
    <article className="travito-card">
      <div className="travito-card-image">
        {listing.image ? (
          <img
            src={listing.image}
            alt={listing.title}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : (
          "Photo"
        )}
      </div>

      <div className="travito-card-body">
        <div className="travito-card-category">
          {listing.category}
        </div>

        <h3 className="travito-card-title">
          {listing.title}
        </h3>

        <div className="travito-card-location">
          {listing.city} • {listing.district}
        </div>

        <div className="travito-card-price">
          {listing.price}
        </div>

        <div className="travito-card-meta">
          <span>Depuis 5 jours</span>
          <span>{listing.views || 0} vues</span>
        </div>
      </div>
    </article>
  );
}