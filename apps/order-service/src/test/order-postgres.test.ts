import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { orders, orderItems, users, schema, type Db } from "@commerical-cinema/schema";
import { OrderService } from "../services/order-service.js";
import { DEFAULT_DATABASE_URL } from "../static/index.js";

// INTEGRATION test: proves a successful checkout is durably committed to Postgres by
// writing through the real OrderService transaction and reading the rows back. Skipped
// (not failed) when Postgres is unreachable or unmigrated, e.g. CI without `bun db:up`.
const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;

async function probeDb(): Promise<boolean> {
  const probe = postgres(databaseUrl, { max: 1, connect_timeout: 2, onnotice: () => {} });
  try {
    await probe`select 1 from orders limit 1`;
    return true;
  } catch {
    return false;
  } finally {
    await probe.end({ timeout: 1 });
  }
}

const reachable = await probeDb();

describe.skipIf(!reachable)("OrderService.createOrder (real Postgres)", () => {
  let client: ReturnType<typeof postgres>;
  let db: Db;
  let service: OrderService;
  let createdUserId: string | undefined;
  let createdOrderId: string | undefined;

  beforeAll(() => {
    client = postgres(databaseUrl, { max: 1 });
    db = drizzle(client, { schema }) as unknown as Db;
    service = new OrderService(db);
  });

  afterAll(async () => {
    if (createdOrderId) {
      // order_items cascade-delete with the order.
      await db.delete(orders).where(eq(orders.id, createdOrderId));
    }
    if (createdUserId) {
      await db.delete(users).where(eq(users.id, createdUserId));
    }
    await client.end({ timeout: 5 });
  });

  test("persists the order header and line items atomically", async () => {
    const [user] = await db
      .insert(users)
      .values({ sessionId: `test-order-sess-${Date.now()}`, ageGroup: "25-34" })
      .returning();
    expect(user).toBeDefined();
    createdUserId = user?.id;

    const showtime = new Date("2026-07-01T20:15:00.000Z");
    const order = await service.createOrder({
      userId: user!.id,
      totalCents: 2247,
      screenNumber: 3,
      seatNumber: "B7",
      showtime,
      paymentRef: "pay_integration_test",
      items: [
        { catalogItemId: "popcorn-lg", itemName: "Large Popcorn", quantity: 2, unitPriceCents: 899 },
        { catalogItemId: "soda-lg", itemName: "Large Soda", quantity: 1, unitPriceCents: 549 },
      ],
    });
    createdOrderId = order.id;

    // Header is readable back with the committed values.
    const [persisted] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(persisted).toBeDefined();
    expect(persisted?.status).toBe("placed");
    expect(persisted?.totalCents).toBe(2247);
    expect(persisted?.userId).toBe(user!.id);
    expect(persisted?.paymentRef).toBe("pay_integration_test");

    // Both line items landed under the same order id.
    const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    expect(lines).toHaveLength(2);
    const byCatalog = new Map(lines.map((line) => [line.catalogItemId, line]));
    expect(byCatalog.get("popcorn-lg")?.quantity).toBe(2);
    expect(byCatalog.get("soda-lg")?.unitPriceCents).toBe(549);
  });
});
