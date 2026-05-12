export default function TaxonomyIcon({
  src,
  alt = "",
  active = false,
  size = 28,
}) {
  return (
    <span
      style={{
        width: size,
        height: size,
        color: active ? "#f26522" : "#23344d",
        display: "inline-flex",
      }}
    >
      <img
        src={src}
        alt={alt}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          filter: active
            ? "brightness(0) saturate(100%) invert(47%) sepia(94%) saturate(2165%) hue-rotate(351deg) brightness(99%) contrast(92%)"
            : "none",
        }}
      />
    </span>
  );
}