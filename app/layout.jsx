export const metadata = {
  title: "Travito V2",
  description: "Marketplace rebuild",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}