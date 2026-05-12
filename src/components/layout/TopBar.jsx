"use client";

import Link from "next/link";

export default function Header() {
  return (
    <header
      style={{
        height: 82,
        background: "#fff",
        borderBottom: "5px solid #f26522",
        position: "sticky",
        top: 0,
        zIndex: 1000,
      }}
    >
      <div
        style={{
          maxWidth: 1800,
          margin: "0 auto",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 30 }}>
          <Link
            href="/"
            style={{
              fontSize: 40,
              fontWeight: 900,
              color: "#f26522",
              textDecoration: "none",
              lineHeight: 1,
            }}
          >
            TRAVITO
          </Link>

          <nav
            style={{
              display: "flex",
              gap: 24,
              fontSize: 14,
            }}
          >
            <span>Catégorie</span>
            <span>Favoris</span>
            <span>Contactez-nous</span>
          </nav>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
          }}
        >
          <span>Se connecter</span>

          <button
            style={{
              background: "#f26522",
              border: "none",
              color: "#fff",
              padding: "14px 24px",
              borderRadius: 10,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Publier une annonce
          </button>
        </div>
      </div>
    </header>
  );
}