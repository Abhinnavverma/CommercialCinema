import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Redis } from "ioredis";
import { StockService } from "../services/stock-service.js";
import { DECREMENT_RESULT, DEFAULT_REDIS_URL, buildStockKey } from "../static/index.js";

// These are INTEGRATION tests: they run the real Lua script against a real Redis
// instance. A JS mock cannot prove atomicity, so the whole point is to exercise the
// actual GET-check-DECRBY command on the docker-compose Redis. If Redis is unreachable
// (e.g. CI without `bun db:up`), the suite is skipped rather than failed.
const redisUrl = process.env.REDIS_URL ?? DEFAULT_REDIS_URL;

async function probeRedis(): Promise<boolean> {
  const probe = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  try {
    await probe.connect();
    const pong = await probe.ping();
    return pong === "PONG";
  } catch {
    return false;
  } finally {
    probe.disconnect();
  }
}

const reachable = await probeRedis();

describe.skipIf(!reachable)("StockService atomic decrement (real Redis)", () => {
  let redis: Redis;
  let service: StockService;
  const createdKeys = new Set<string>();

  beforeAll(() => {
    redis = new Redis(redisUrl, { maxRetriesPerRequest: 3 });
    service = new StockService(redis);
  });

  afterAll(async () => {
    if (createdKeys.size > 0) {
      await redis.del(...createdKeys);
    }
    await redis.quit();
  });

  async function seed(itemId: string, stock: number): Promise<void> {
    const key = buildStockKey(itemId);
    createdKeys.add(key);
    await redis.set(key, String(stock));
  }

  test("5 parallel buyers vs 1 stock: exactly one succeeds, four fail, never negative", async () => {
    const itemId = `test-oversell-single-${Date.now()}`;
    await seed(itemId, 1);

    // Fire 5 decrements concurrently. Because Redis serializes the Lua script, exactly
    // one caller can observe stock >= 1 and decrement it; the rest see 0.
    const outcomes = await Promise.all(
      Array.from({ length: 5 }, () => service.decrement(itemId, 1)),
    );

    const successes = outcomes.filter((o) => o.code === DECREMENT_RESULT.SUCCESS);
    const insufficient = outcomes.filter((o) => o.code === DECREMENT_RESULT.INSUFFICIENT);

    expect(successes).toHaveLength(1);
    expect(insufficient).toHaveLength(4);
    expect(successes[0]?.remaining).toBe(0);

    const finalStock = Number(await redis.get(buildStockKey(itemId)));
    expect(finalStock).toBe(0);
    expect(finalStock).toBeGreaterThanOrEqual(0);
  });

  test("500 parallel buyers vs 100 stock: exactly 100 succeed, 400 fail, final stock 0", async () => {
    const itemId = `test-oversell-bulk-${Date.now()}`;
    const initial = 100;
    const attempts = 500;
    await seed(itemId, initial);

    const outcomes = await Promise.all(
      Array.from({ length: attempts }, () => service.decrement(itemId, 1)),
    );

    const successes = outcomes.filter((o) => o.code === DECREMENT_RESULT.SUCCESS).length;
    const failures = outcomes.filter((o) => o.code === DECREMENT_RESULT.INSUFFICIENT).length;

    // The mathematical invariant: successes == initial stock, failures == the remainder,
    // and the ledger reconciles exactly. Overselling would make successes > initial.
    expect(successes).toBe(initial);
    expect(failures).toBe(attempts - initial);
    expect(successes + failures).toBe(attempts);

    const finalStock = Number(await redis.get(buildStockKey(itemId)));
    expect(finalStock).toBe(0);
    expect(finalStock).toBeGreaterThanOrEqual(0);
  });

  test("decrement on a missing key returns NOT_FOUND without creating it", async () => {
    const itemId = `test-missing-${Date.now()}`;
    const outcome = await service.decrement(itemId, 1);

    expect(outcome.code).toBe(DECREMENT_RESULT.NOT_FOUND);
    expect(await redis.get(buildStockKey(itemId))).toBeNull();
  });

  test("quantity larger than stock is rejected atomically and leaves stock untouched", async () => {
    const itemId = `test-qty-${Date.now()}`;
    await seed(itemId, 3);

    const outcome = await service.decrement(itemId, 5);

    expect(outcome.code).toBe(DECREMENT_RESULT.INSUFFICIENT);
    expect(outcome.remaining).toBe(3);
    expect(Number(await redis.get(buildStockKey(itemId)))).toBe(3);
  });

  test("release returns reserved units to the pool atomically", async () => {
    const itemId = `test-release-${Date.now()}`;
    await seed(itemId, 10);

    const reserved = await service.decrement(itemId, 4);
    expect(reserved.code).toBe(DECREMENT_RESULT.SUCCESS);
    expect(reserved.remaining).toBe(6);

    const remaining = await service.release(itemId, 4);
    expect(remaining).toBe(10);
    expect(Number(await redis.get(buildStockKey(itemId)))).toBe(10);
  });

  test("release on a missing key returns -1 without creating it", async () => {
    const itemId = `test-release-missing-${Date.now()}`;
    const remaining = await service.release(itemId, 1);

    expect(remaining).toBe(-1);
    expect(await redis.get(buildStockKey(itemId))).toBeNull();
  });

  test("getStock returns live counts and 0 for unknown items", async () => {
    const known = `test-getstock-${Date.now()}`;
    await seed(known, 42);

    const stock = await service.getStock([known, `test-unknown-${Date.now()}`]);

    expect(stock.get(known)).toBe(42);
    expect([...stock.values()].some((v) => v === 0)).toBe(true);
  });

  test("setStock sets an absolute quantity", async () => {
    const itemId = `test-setstock-${Date.now()}`;
    const remaining = await service.setStock(itemId, 77);

    expect(remaining).toBe(77);
    expect(await redis.get(buildStockKey(itemId))).toBe("77");
  });
});
