import { EVENTS, QUEUES, createNamedQueue, createQueue } from "@commerical-cinema/event-bus";
import type { Redis } from "ioredis";
import { createDb, inventorySql } from "@commerical-cinema/schema";
import { SEED_PRODUCTS } from "@commerical-cinema/schema";
import {
  METRICS_POLL_INTERVAL_MS,
  STOCK_AVAILABLE_KEY_PREFIX,
  STOCK_SCAN_COUNT,
} from "../static/simulation.constants.js";
import type { MetricsSnapshot, OrderOutcome, QueueDepthSnapshot, StockLevelSnapshot } from "../types.js";

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)]!;
}

export type MetricsCollector = {
  recordOutcome(outcome: OrderOutcome): void;
  startPolling(): void;
  stopPolling(): void;
  snapshot(): MetricsSnapshot;
  getOutcomes(): OrderOutcome[];
};

type MetricsCollectorConfig = {
  redis: Redis;
  redisUrl: string;
  databaseUrl: string;
  initialStock: Record<string, number>;
  mode: "live" | "stub";
  runStartedMs: number;
  readStock?: () => Promise<StockLevelSnapshot>;
};

export function createMetricsCollector(config: MetricsCollectorConfig): MetricsCollector {
  const outcomes: OrderOutcome[] = [];
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let lastRedisStock: StockLevelSnapshot = {};
  let lastPostgresStock: StockLevelSnapshot | null = null;
  let lastPostgresSyncMs = config.runStartedMs;
  let maxStockSyncLagMs = 0;
  let maxStockSyncDelta = 0;
  let latestQueueDepths: QueueDepthSnapshot | null = null;

  const cartQueue = createNamedQueue(QUEUES.CART_CLEANUP, config.redisUrl);
  const analyticsQueue = createNamedQueue(QUEUES.ANALYTICS, config.redisUrl);
  const zeroStockQueue = createQueue(EVENTS.ITEM_ZERO_STOCK, config.redisUrl);

  async function readRedisStock(): Promise<StockLevelSnapshot> {
    const levels: StockLevelSnapshot = {};
    let cursor = "0";

    do {
      const [next, keys] = await config.redis.scan(
        cursor,
        "MATCH",
        `${STOCK_AVAILABLE_KEY_PREFIX}*`,
        "COUNT",
        STOCK_SCAN_COUNT,
      );
      cursor = next;

      if (keys.length > 0) {
        const values = await config.redis.mget(keys);
        keys.forEach((key, index) => {
          const itemId = key.slice(STOCK_AVAILABLE_KEY_PREFIX.length);
          const raw = values[index];
          const available = raw === null ? 0 : Number(raw);
          levels[itemId] = available;
        });
      }
    } while (cursor !== "0");

    for (const product of SEED_PRODUCTS) {
      if (!(product.id in levels)) {
        levels[product.id] = 0;
      }
    }

    return levels;
  }

  async function readPostgresStock(): Promise<StockLevelSnapshot> {
    const db = createDb(config.databaseUrl);
    const rows = await db.select().from(inventorySql);
    const levels: StockLevelSnapshot = {};
    for (const row of rows) {
      levels[row.itemId] = row.availableStock;
    }
    return levels;
  }

  async function pollPlatformMetrics(): Promise<void> {
    lastRedisStock = config.readStock ? await config.readStock() : await readRedisStock();

    if (config.mode === "live") {
      const [cartCounts, analyticsCounts, zeroCounts] = await Promise.all([
        cartQueue.getJobCounts("waiting", "active", "delayed"),
        analyticsQueue.getJobCounts("waiting", "active", "delayed"),
        zeroStockQueue.getJobCounts("waiting", "active", "delayed"),
      ]);

      latestQueueDepths = {
        cartCleanup: cartCounts.waiting + cartCounts.active + cartCounts.delayed,
        analytics: analyticsCounts.waiting + analyticsCounts.active + analyticsCounts.delayed,
        itemZeroStock: zeroCounts.waiting + zeroCounts.active + zeroCounts.delayed,
      };

      try {
        const pgStock = await readPostgresStock();
        let maxDelta = 0;
        for (const product of SEED_PRODUCTS) {
          const redisLevel = lastRedisStock[product.id] ?? 0;
          const pgLevel = pgStock[product.id] ?? 0;
          maxDelta = Math.max(maxDelta, Math.abs(redisLevel - pgLevel));
        }

        if (maxDelta !== maxStockSyncDelta) {
          maxStockSyncDelta = maxDelta;
          lastPostgresSyncMs = Date.now();
        }

        const lagMs = maxDelta > 0 ? Date.now() - lastPostgresSyncMs : 0;
        maxStockSyncLagMs = Math.max(maxStockSyncLagMs, lagMs);
        lastPostgresStock = pgStock;
      } catch {
        lastPostgresStock = null;
      }
    }
  }

  function buildSnapshot(): MetricsSnapshot {
    const latencies = outcomes.map((outcome) => outcome.latencyMs);
    const statusCounts: Record<string, number> = {};
    for (const outcome of outcomes) {
      const key = String(outcome.statusCode);
      statusCounts[key] = (statusCounts[key] ?? 0) + 1;
    }

    const succeeded = outcomes.filter((outcome) => outcome.statusCode === 201).length;
    const elapsedSec = Math.max(1, (Date.now() - config.runStartedMs) / 1000);
    const conflicts = outcomes.filter((outcome) => outcome.statusCode === 409).length;

    return {
      timestampMs: Date.now(),
      ordersCompleted: succeeded,
      ordersFailed: outcomes.length - succeeded,
      ordersPerSecond: succeeded / elapsedSec,
      p50LatencyMs: percentile(latencies, 50),
      p95LatencyMs: percentile(latencies, 95),
      statusCounts,
      queueDepths: latestQueueDepths,
      redisStock: lastRedisStock,
      postgresStock: lastPostgresStock,
      stockSyncLagMs: maxStockSyncLagMs,
      stockSyncMaxDelta: maxStockSyncDelta,
      conflictRate: outcomes.length > 0 ? conflicts / outcomes.length : 0,
    };
  }

  return {
    recordOutcome(outcome: OrderOutcome) {
      outcomes.push(outcome);
    },

    startPolling() {
      if (pollTimer) {
        return;
      }
      void pollPlatformMetrics();
      pollTimer = setInterval(() => {
        void pollPlatformMetrics();
      }, METRICS_POLL_INTERVAL_MS);
    },

    stopPolling() {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    },

    snapshot() {
      return buildSnapshot();
    },

    getOutcomes() {
      return outcomes;
    },
  };
}

export function auditOversell(
  initialStock: Record<string, number>,
  outcomes: OrderOutcome[],
  finalStock: Record<string, number>,
): { oversellEvents: number; details: { itemId: string; sold: number; initialStock: number }[] } {
  const soldByItem: Record<string, number> = {};

  for (const outcome of outcomes) {
    if (outcome.statusCode !== 201) {
      continue;
    }
    for (const line of outcome.items) {
      soldByItem[line.catalogItemId] = (soldByItem[line.catalogItemId] ?? 0) + line.quantity;
    }
  }

  const details: { itemId: string; sold: number; initialStock: number }[] = [];
  let oversellEvents = 0;

  for (const [itemId, sold] of Object.entries(soldByItem)) {
    const initial = initialStock[itemId] ?? 0;
    const final = finalStock[itemId] ?? 0;
    const impliedSold = initial - final;

    if (sold > initial || impliedSold > initial) {
      oversellEvents += 1;
      details.push({ itemId, sold: Math.max(sold, impliedSold), initialStock: initial });
    }
  }

  return { oversellEvents, details };
}
