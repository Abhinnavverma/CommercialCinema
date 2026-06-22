import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export * from "./users";
export * from "./orders";
export * from "./catalog-items";
export * from "./inventory-sql";
export * from "./analytics";
export * from "./cart";
export * from "./auth";
export * from "./seed-data";

import { users } from "./users";
import { orders, orderItems } from "./orders";
import { catalogItems } from "./catalog-items";
import { inventorySql } from "./inventory-sql";
import { analyticsEvents } from "./analytics";

export const schema = {
  users,
  orders,
  orderItems,
  catalogItems,
  inventorySql,
  analyticsEvents,
};

export function createDb(connectionString: string) {
  const client = postgres(connectionString, { max: 10 });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;
