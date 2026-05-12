export const categories = [
  {
    slug: "automotives",
    label: "Automotives",
    types: [
      { slug: "auto-occasions", label: "Auto Occasions" },
      { slug: "location-voitures", label: "Location Voitures" },
      { slug: "auto-pieces-et-accessoires", label: "Auto Pièces et Accessoires" },
      { slug: "utilitaires-pick-ups", label: "Utilitaires Pick-Ups" },
      { slug: "camions", label: "Camions" },
    ],
  },
  {
    slug: "immobilier",
    label: "Immobilier",
    types: [
      {
        slug: "immobilier-vente",
        label: "Immobilier Vente",
        subtypes: [
          { slug: "appartement", label: "Appartement" },
          { slug: "villa", label: "Villa" },
          { slug: "maison", label: "Maison" },
          { slug: "studio", label: "Studio" },
          { slug: "terrain", label: "Terrain" },
        ],
      },
      {
        slug: "immobilier-location",
        label: "Immobilier Location",
        subtypes: [
          { slug: "appartement", label: "Appartement" },
          { slug: "villa", label: "Villa" },
          { slug: "maison", label: "Maison" },
          { slug: "studio", label: "Studio" },
        ],
      },
    ],
  },
  {
    slug: "motos-et-2-roues",
    label: "Motos et 2 Roues",
    types: [
      { slug: "motos", label: "Motos" },
      { slug: "velos", label: "Vélos" },
      { slug: "trottinettes", label: "Trottinettes" },
      { slug: "quads", label: "Quads" },
    ],
  },
];

export const commonFilters = [
  { key: "category", label: "Catégorie", type: "select" },
  { key: "city", label: "Ville", type: "select" },
  { key: "price", label: "Prix", type: "range" },
  { key: "hasPhoto", label: "Avec photo", type: "toggle" },
  { key: "hasPrice", label: "Avec prix", type: "toggle" },
];