import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Redis } from "ioredis";
import { SEED_PRODUCTS } from "@commerical-cinema/schema";
import type { CartItem } from "@commerical-cinema/schema";
import {
  STOCK_AVAILABLE_KEY_PREFIX,
  STUB_PAYMENT_LATENCY_MS,
  STUB_PAYMENT_SUCCESS_RATE,
} from "../static/simulation.constants.js";
import type { OrderOutcome } from "../types.js";

const DECREMENT_COMMAND = "decrementStock";
const RELEASE_COMMAND = "releaseStock";

const DECREMENT_SCRIPT = readFileSync(
  fileURLToPath(new URL("../../../stock-service/src/lua/decrement-stock.lua", import.meta.url)),
  "utf8",
);
const RELEASE_SCRIPT = readFileSync(
  fileURLToPath(new URL("../../../stock-service/src/lua/release-stock.lua", import.meta.url)),
  "utf8",
);

const STOCK_DECREMENT_SUCCESS = 1;

type StockRedis = Redis & {
  decrementStock(key: string, quantity: number): Promise<[number, number]>;
  releaseStock(key: string, quantity: number): Promise<number>;
};

function buildStockKey(itemId: string): string {
  return `${STOCK_AVAILABLE_KEY_PREFIX}${itemId}`;
}

export type StubStock = {
  refill(initialStock: Record<string, number>): Promise<void>;
  getLevels(): Promise<Record<string, number>>;
  decrement(itemId: string, quantity: number): Promise<{ code: number; remaining: number }>;
  release(itemId: string, quantity: number): Promise<number>;
};

export function createStubStock(redis: Redis): StubStock {
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

  const stockRedis = redis as StockRedis;

  return {
    async refill(initialStock: Record<string, number>): Promise<void> {
      const pipeline = stockRedis.pipeline();
      for (const product of SEED_PRODUCTS) {
        const quantity = initialStock[product.id] ?? product.initialStock;
        pipeline.set(buildStockKey(product.id), String(quantity));
      }
      await pipeline.exec();
    },

    async getLevels(): Promise<Record<string, number>> {
      const levels: Record<string, number> = {};
      for (const product of SEED_PRODUCTS) {
        const raw = await stockRedis.get(buildStockKey(product.id));
        levels[product.id] = raw === null ? 0 : Number(raw);
      }
      return levels;
    },

    async decrement(itemId: string, quantity: number) {
      const [code, remaining] = await stockRedis.decrementStock(buildStockKey(itemId), quantity);
      return { code, remaining };
    },

    async release(itemId: string, quantity: number) {
      return stockRedis.releaseStock(buildStockKey(itemId), quantity);
    },
  };
}

type StubOrderInput = {
  patronId: string;
  userId: string;
  items: CartItem[];
  screenNumber: number;
  seatNumber: string;
  showtime: string;
};

type CommittedOrder = {
  orderId: string;
  items: CartItem[];
};

export type StubOrderPipeline = {
  placeOrder(input: StubOrderInput): Promise<OrderOutcome>;
  getCommittedOrders(): CommittedOrder[];
};

export function createStubOrderPipeline(stock: StubStock): StubOrderPipeline {
  const committed: CommittedOrder[] = [];
  let orderCounter = 0;

  async function releaseAll(
    reserved: { itemId: string; quantity: number }[],
  ): Promise<void> {
    await Promise.all(reserved.map((line) => stock.release(line.itemId, line.quantity)));
  }

  return {
    async placeOrder(input: StubOrderInput): Promise<OrderOutcome> {
      const started = performance.now();
      const reserved: { itemId: string; quantity: number }[] = [];

      for (const line of input.items) {
        const outcome = await stock.decrement(line.catalogItemId, line.quantity);
        if (outcome.code !== STOCK_DECREMENT_SUCCESS) {
          await releaseAll(reserved);
          return {
            patronId: input.patronId,
            statusCode: 409,
            latencyMs: performance.now() - started,
            timestampMs: Date.now(),
            items: input.items,
          };
        }
        reserved.push({ itemId: line.catalogItemId, quantity: line.quantity });
      }

      if (STUB_PAYMENT_LATENCY_MS > 0) {
        await new Promise((resolve) => setTimeout(resolve, STUB_PAYMENT_LATENCY_MS));
      }

      if (Math.random() > STUB_PAYMENT_SUCCESS_RATE) {
        await releaseAll(reserved);
        return {
          patronId: input.patronId,
          statusCode: 402,
          latencyMs: performance.now() - started,
          timestampMs: Date.now(),
          items: input.items,
        };
      }

      orderCounter += 1;
      committed.push({
        orderId: `stub-order-${orderCounter}`,
        items: input.items,
      });

      return {
        patronId: input.patronId,
        statusCode: 201,
        latencyMs: performance.now() - started,
        timestampMs: Date.now(),
        items: input.items,
      };
    },

    getCommittedOrders() {
      return committed;
    },
  };
}
