import type { OrderPlacedEvent } from "@commerical-cinema/event-bus";
import type { AnalyticsService } from "../services/analytics-service.js";
import {
  ANALYTICS_BATCH_INTERVAL_MS,
  ANALYTICS_BATCH_MAX_SIZE,
} from "../static/index.js";

type LogFn = (message: string, error?: unknown) => void;

export type AnalyticsBatcher = {
  enqueue(event: OrderPlacedEvent): void;
  flush(): Promise<void>;
  start(): void;
  stop(): Promise<void>;
};

type AnalyticsBatcherConfig = {
  analyticsService: Pick<AnalyticsService, "bulkInsert">;
  batchMaxSize?: number;
  batchIntervalMs?: number;
  log?: LogFn;
};

// Tier-1 analytics ingestion: buffer OrderPlaced events in memory and flush in bulk so
// checkout never blocks on Postgres. Mirrors the write-behind worker's interval + guard
// pattern — overlapping flushes are skipped, failures are logged and retried on the
// next tick.
export function createAnalyticsBatcher(config: AnalyticsBatcherConfig): AnalyticsBatcher {
  const {
    analyticsService,
    batchMaxSize = ANALYTICS_BATCH_MAX_SIZE,
    batchIntervalMs = ANALYTICS_BATCH_INTERVAL_MS,
    log = () => {},
  } = config;

  const buffer: OrderPlacedEvent[] = [];
  let inFlight = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  async function flush(): Promise<void> {
    if (inFlight || buffer.length === 0) {
      return;
    }

    inFlight = true;
    const batch = buffer.splice(0);

    try {
      await analyticsService.bulkInsert(batch);
    } catch (error) {
      log("analytics batch flush failed", error);
      buffer.unshift(...batch);
    } finally {
      inFlight = false;
    }
  }

  return {
    enqueue(event: OrderPlacedEvent): void {
      buffer.push(event);
      if (buffer.length >= batchMaxSize) {
        void flush();
      }
    },
    flush,
    start(): void {
      timer = setInterval(() => {
        void flush();
      }, batchIntervalMs);
    },
    async stop(): Promise<void> {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      await flush();
    },
  };
}
