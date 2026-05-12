import ListingCard from "./ListingCard";

export default function ListingGrid({ listings }) {
  return (
    <div className="travito-grid">
      {listings.map((listing) => (
        <ListingCard key={listing.id} listing={listing} />
      ))}
    </div>
  );
}