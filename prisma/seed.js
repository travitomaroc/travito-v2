require("dotenv/config");
const { Client } = require("pg");

async function main() {
  const { categories } = await import("../src/data/taxonomies/categories.js");

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  console.log("Seeding categories...");

  for (let i = 0; i < categories.length; i++) {
    const category = categories[i];

    const catResult = await client.query(
      `
      INSERT INTO "Category" ("id", "slug", "label", "icon", "position", "isActive", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, $1, $2, $3, $4, true, now(), now())
      ON CONFLICT ("slug")
      DO UPDATE SET
        "label" = EXCLUDED."label",
        "icon" = EXCLUDED."icon",
        "position" = EXCLUDED."position",
        "updatedAt" = now()
      RETURNING "id";
      `,
      [category.slug, category.label, category.icon || null, i]
    );

    const categoryId = catResult.rows[0].id;

    for (let j = 0; j < (category.types || []).length; j++) {
      const type = category.types[j];

      await client.query(
        `
        INSERT INTO "CategoryType" ("id", "categoryId", "slug", "label", "icon", "position", "isActive", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, true, now(), now())
        ON CONFLICT ("categoryId", "slug")
        DO UPDATE SET
          "label" = EXCLUDED."label",
          "icon" = EXCLUDED."icon",
          "position" = EXCLUDED."position",
          "updatedAt" = now();
        `,
        [categoryId, type.slug, type.label, type.icon || null, j]
      );
    }
  }

  await client.end();

  console.log("Seed complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});