import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Redis } from "ioredis";
import { DECREMENT_COMMAND, RELEASE_COMMAND, buildStockKey } from "../static/index.js";

// Loaded once at module init; registered on the Redis client as custom commands.
const DECREMENT_SCRIPT = readFileSync(
  fileURLToPath(new URL("../lua/decrement-stock.lua", import.meta.url)),
  "utf8",
);
const RELEASE_SCRIPT = readFileSync(
  fileURLToPath(new URL("../lua/release-stock.lua", import.meta.url)),
  "utf8",
);

export type DecrementOutcome = {
  code: number;
  remaining: number;
};

// ioredis attaches defineCommand methods dynamically; declare the typed surface here.
type StockRedis = Redis & {
  decrementStock(key: string, quantity: number): Promise<[number, number]>;
  releaseStock(key: string, quantity: number): Promise<number>;
};

export class StockService {
  private readonly redis: StockRedis;

  constructor(redis: Redis) {
    // Register the atomic decrement as a custom command (EVALSHA under the hood). Both
    // production and the integration tests share this exact code path, so the tests
    // prove the real script's behaviour, not a mock's.
    if (!(DECREMENT_COMMAND in redis)) {
      redis.defineCommand(DECREMENT_COMMAND, {
        numberOfKeys: 1,
        lua: DECREMENT_SCRIPT,
      });
    }
    if (!(RELEASE_COMMAND in redis)) {
      redis.defineCommand(RELEASE_COMMAND, {
        numberOfKeys: 1,
        lua: RELEASE_SCRIPT,
      });
    }
    this.redis = redis as StockRedis;
  }

  async getStock(itemIds: string[]): Promise<Map<string, number>> {
    const stock = new Map<string, number>();
    if (itemIds.length === 0) {
      return stock;
    }

    const values = await this.redis.mget(itemIds.map(buildStockKey));
    itemIds.forEach((itemId, index) => {
      const raw = values[index];
      stock.set(itemId, raw === null ? 0 : Number(raw));
    });
    return stock;
  }

  async decrement(itemId: string, quantity: number): Promise<DecrementOutcome> {
    const [code, remaining] = await this.redis.decrementStock(buildStockKey(itemId), quantity);
    return { code, remaining };
  }

  // Returns reserved units to the available pool. Used by the Order Service to roll back
  // a reservation when payment fails or a multi-item order is only partially satisfied.
  async release(itemId: string, quantity: number): Promise<number> {
    return this.redis.releaseStock(buildStockKey(itemId), quantity);
  }
}
