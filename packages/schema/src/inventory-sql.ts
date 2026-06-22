import { pgTable, varchar, integer, timestamp } from "drizzle-orm/pg-core";
import { catalogItems } from "./catalog-items";

export const inventorySql = pgTable("inventory_sql", {
  itemId: varchar("item_id", { length: 64 })
    .primaryKey()
    .references(() => catalogItems.id, { onDelete: "cascade" }),
  availableStock: integer("available_stock").notNull().default(0),
  reservedStock: integer("reserved_stock").notNull().default(0),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InventorySql = typeof inventorySql.$inferSelect;
export type NewInventorySql = typeof inventorySql.$inferInsert;
