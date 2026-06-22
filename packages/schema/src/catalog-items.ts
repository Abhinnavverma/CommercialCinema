import { pgTable, varchar, integer, text, boolean } from "drizzle-orm/pg-core";

export const catalogItems = pgTable("catalog_items", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  imageUrl: varchar("image_url", { length: 512 }),
  priceCents: integer("price_cents").notNull(),
  isActive: boolean("is_active").notNull().default(true),
});

export type CatalogItem = typeof catalogItems.$inferSelect;
export type NewCatalogItem = typeof catalogItems.$inferInsert;
