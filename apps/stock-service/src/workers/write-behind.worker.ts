import type { Redis } from "ioredis";
import { sql } from "drizzle-orm";
import { inventorySql, type Db } from "@commerical-cinema/schema";
import {
  STOCK_AVAILABLE_KEY_PREFIX,
  STOCK_SCAN_COUNT,
  WRITE_BEHIND_INTERVAL_MS,
} from "../static/index.js";

export type WriteBehindWorker = {
  stop(): void;
};

type LogFn = (message: string, error?: unknown) => void;

// Write-Behind caching: Redis is the system of record during traffic spikes. This
// worker periodically reconciles authoritative Redis stock counts into Postgres so the
// checkout hot-path never blocks on the DB. On failure it logs and retries on the next
// tick; because Redis stays correct, browsing and ordering continue uninterrupted even
// if Postgres is down (graceful degradation).
export function startWriteBehindWorker(redis: Redis, db: Db, log: LogFn): WriteBehindWorker {
  let inFlight = false;

  async function flush(): Promise<void> {
    if (inFlight) {
      return; // never overlap flushes
    }
    inFlight = true;
    try {
      const updates: { itemId: string; availableStock: number }[] = [];
      let cursor = "0";

      do {
        const [next, keys] = await redis.scan(
          cursor,
          "MATCH",
          `${STOCK_AVAILABLE_KEY_PREFIX}*`,
          "COUNT",
          STOCK_SCAN_COUNT,
        );
        cursor = next;

        if (keys.length > 0) {
          const values = await redis.mget(keys);
          keys.forEach((key, index) => {
            const raw = values[index];
            if (raw === null) {
              return;
            }
            updates.push({
              itemId: key.slice(STOCK_AVAILABLE_KEY_PREFIX.length),
              availableStock: Number(raw),
            });
          });
        }
      } while (cursor !== "0");

      for (const update of updates) {
        await db
          .insert(inventorySql)
          .values({ itemId: update.itemId, availableStock: update.availableStock })
          .onConflictDoUpdate({
            target: inventorySql.itemId,
            set: { availableStock: update.availableStock, syncedAt: sql`now()` },
          });
      }
    } catch (error) {
      log("write-behind flush failed", error);
    } finally {
      inFlight = false;
    }
  }

  const timer = setInterval(() => {
    void flush();
  }, WRITE_BEHIND_INTERVAL_MS);

  return {
    stop() {
      clearInterval(timer);
    },
  };
}
