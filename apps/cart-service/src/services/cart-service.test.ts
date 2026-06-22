import { describe, expect, test } from "bun:test";
import { CartService } from "./cart-service.js";
import { createMockRedis } from "../test/mock-redis.js";
import { CART_TTL_SECONDS } from "../static/index.js";

const userId = "user-123";

const sampleItems = [
  {
    catalogItemId: "popcorn-lg",
    quantity: 2,
    unitPriceCents: 899,
    name: "Large Popcorn",
  },
];

describe("CartService (data access)", () => {
  test("read on missing key returns empty array", async () => {
    const redis = createMockRedis();
    const service = new CartService(redis);

    const items = await service.read(userId);
    expect(items).toEqual([]);
  });

  test("write persists items with EX 10800 and read returns them", async () => {
    const redis = createMockRedis();
    const service = new CartService(redis);

    await service.write(userId, sampleItems);

    expect(redis.state.lastTtl).toBe(CART_TTL_SECONDS);
    expect(redis.state.ttlCalls).toEqual([CART_TTL_SECONDS]);

    const items = await service.read(userId);
    expect(items).toEqual(sampleItems);
  });

  test("remove deletes the key", async () => {
    const redis = createMockRedis();
    const service = new CartService(redis);

    await service.write(userId, sampleItems);
    await service.remove(userId);

    const items = await service.read(userId);
    expect(items).toEqual([]);
  });
});
