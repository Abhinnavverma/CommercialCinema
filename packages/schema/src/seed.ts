import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { catalogItems } from "./catalog-items.js";
import { inventorySql } from "./inventory-sql.js";
import { SEED_PRODUCTS } from "./seed-data.js";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://cinema:cinema@localhost:5433/cinema";

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client);

try {
  for (const product of SEED_PRODUCTS) {
    // Idempotent: re-running the seed refreshes catalog details and resets inventory.
    await db
      .insert(catalogItems)
      .values({
        id: product.id,
        name: product.name,
        description: product.description,
        imageUrl: product.imageUrl,
        priceCents: product.priceCents,
      })
      .onConflictDoUpdate({
        target: catalogItems.id,
        set: {
          name: product.name,
          description: product.description,
          imageUrl: product.imageUrl,
          priceCents: product.priceCents,
        },
      });

    await db
      .insert(inventorySql)
      .values({ itemId: product.id, availableStock: product.initialStock })
      .onConflictDoUpdate({
        target: inventorySql.itemId,
        set: { availableStock: product.initialStock, syncedAt: sql`now()` },
      });
  }

  console.log(`Seeded ${SEED_PRODUCTS.length} catalog items and inventory rows`);
} catch (error) {
  console.error("Seed failed:", error);
  process.exit(1);
} finally {
  await client.end();
}
