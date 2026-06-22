import { QUEUES, createNamedWorker } from "@commerical-cinema/event-bus";
import type { OrderPlacedEvent } from "@commerical-cinema/event-bus";
import type { AnalyticsBatcher } from "../workers/analytics-batcher.js";

export function startAnalyticsConsumer(redisUrl: string, batcher: AnalyticsBatcher) {
  return createNamedWorker<OrderPlacedEvent>(QUEUES.ANALYTICS, redisUrl, async (job) => {
    batcher.enqueue(job.data);
  });
}
