import {
  P95_LATENCY_THRESHOLD_MS,
  QUEUE_DEPTH_THRESHOLD,
  STOCK_SYNC_LAG_THRESHOLD_MS,
} from "../static/simulation.constants.js";
import type { BreakEvent, OrderOutcome, SimulationReport, SimulationRun, TimeSeriesBucket } from "../types.js";
import { auditOversell } from "./metrics-collector.js";

type BuildReportInput = {
  run: SimulationRun;
  outcomes: OrderOutcome[];
  initialStock: Record<string, number>;
  finalStock: Record<string, number>;
  timeSeries: TimeSeriesBucket[];
};

function detectBreakEvents(timeSeries: TimeSeriesBucket[]): BreakEvent[] {
  const events: BreakEvent[] = [];

  for (const bucket of timeSeries) {
    if (bucket.p95LatencyMs > P95_LATENCY_THRESHOLD_MS) {
      events.push({
        timestampMs: bucket.timestampMs,
        metric: "p95_latency",
        message: `p95 latency exceeded ${P95_LATENCY_THRESHOLD_MS}ms`,
        actual: bucket.p95LatencyMs,
        threshold: P95_LATENCY_THRESHOLD_MS,
      });
    }

    if (bucket.queueDepths) {
      if (bucket.queueDepths.analytics > QUEUE_DEPTH_THRESHOLD) {
        events.push({
          timestampMs: bucket.timestampMs,
          metric: "analytics_queue_depth",
          message: `AnalyticsQueue depth exceeded ${QUEUE_DEPTH_THRESHOLD}`,
          actual: bucket.queueDepths.analytics,
          threshold: QUEUE_DEPTH_THRESHOLD,
        });
      }
      if (bucket.queueDepths.cartCleanup > QUEUE_DEPTH_THRESHOLD) {
        events.push({
          timestampMs: bucket.timestampMs,
          metric: "cart_cleanup_queue_depth",
          message: `CartCleanupQueue depth exceeded ${QUEUE_DEPTH_THRESHOLD}`,
          actual: bucket.queueDepths.cartCleanup,
          threshold: QUEUE_DEPTH_THRESHOLD,
        });
      }
      if (bucket.queueDepths.itemZeroStock > QUEUE_DEPTH_THRESHOLD) {
        events.push({
          timestampMs: bucket.timestampMs,
          metric: "item_zero_stock_queue_depth",
          message: `ItemZeroStock queue depth exceeded ${QUEUE_DEPTH_THRESHOLD}`,
          actual: bucket.queueDepths.itemZeroStock,
          threshold: QUEUE_DEPTH_THRESHOLD,
        });
      }
    }

    if (bucket.stockSyncLagMs > STOCK_SYNC_LAG_THRESHOLD_MS) {
      events.push({
        timestampMs: bucket.timestampMs,
        metric: "stock_sync_lag",
        message: `Redis↔Postgres sync lag exceeded ${STOCK_SYNC_LAG_THRESHOLD_MS}ms`,
        actual: bucket.stockSyncLagMs,
        threshold: STOCK_SYNC_LAG_THRESHOLD_MS,
      });
    }

    for (const [itemId, level] of Object.entries(bucket.redisStock)) {
      if (level === 0) {
        events.push({
          timestampMs: bucket.timestampMs,
          metric: `stock_exhaustion_${itemId}`,
          message: `${itemId} stock hit 0`,
          actual: 0,
          threshold: 0,
        });
      }
    }

    if (bucket.conflictRate > 0.3 && bucket.ordersCompleted + bucket.ordersFailed > 10) {
      events.push({
        timestampMs: bucket.timestampMs,
        metric: "conflict_rate",
        message: "409 conflict rate spike (stock exhaustion)",
        actual: bucket.conflictRate,
        threshold: 0.3,
      });
    }
  }

  events.sort((a, b) => a.timestampMs - b.timestampMs);

  const seen = new Set<string>();
  const unique: BreakEvent[] = [];
  for (const event of events) {
    const key = event.metric;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(event);
  }

  return unique.sort((a, b) => a.timestampMs - b.timestampMs);
}

function peakQueueDepth(timeSeries: TimeSeriesBucket[]) {
  let peak: SimulationReport["peakQueueDepth"] = null;

  for (const bucket of timeSeries) {
    if (!bucket.queueDepths) {
      continue;
    }
    if (
      !peak ||
      bucket.queueDepths.analytics > peak.analytics ||
      bucket.queueDepths.cartCleanup > peak.cartCleanup
    ) {
      peak = { ...bucket.queueDepths };
    }
  }

  return peak;
}

export function buildReport(input: BuildReportInput): SimulationReport {
  const { run, outcomes, initialStock, finalStock, timeSeries } = input;
  const completedAt = run.completedAt ?? new Date().toISOString();
  const startedMs = new Date(run.startedAt).getTime();
  const completedMs = new Date(completedAt).getTime();

  const succeeded = outcomes.filter((outcome) => outcome.statusCode === 201).length;
  const failed = outcomes.length - succeeded;
  const { oversellEvents, details } = auditOversell(initialStock, outcomes, finalStock);
  const breakFirst = detectBreakEvents(timeSeries);

  const finalSnapshot = timeSeries[timeSeries.length - 1];
  const finalP95 = finalSnapshot?.p95LatencyMs ?? 0;
  const maxStockSyncLagMs = Math.max(...timeSeries.map((bucket) => bucket.stockSyncLagMs), 0);

  const breakLines = breakFirst.map(
    (event, index) =>
      `${index + 1}. [${new Date(event.timestampMs).toISOString()}] ${event.message} (actual: ${event.actual})`,
  );

  const summaryParts = [
    `Mode: ${run.config.mode}`,
    `Patrons: ${run.totalPatrons}`,
    `Orders: ${succeeded} succeeded, ${failed} failed`,
    `Final p95 latency: ${Math.round(finalP95)}ms`,
    `Oversell events: ${oversellEvents}`,
  ];

  if (breakLines.length > 0) {
    summaryParts.push("Break-first:", ...breakLines);
  } else {
    summaryParts.push("No thresholds breached during run.");
  }

  return {
    runId: run.runId,
    mode: run.config.mode,
    startedAt: run.startedAt,
    completedAt,
    durationMs: completedMs - startedMs,
    totalPatrons: run.totalPatrons,
    ordersAttempted: outcomes.length,
    ordersSucceeded: succeeded,
    ordersFailed: failed,
    oversellEvents,
    oversellDetails: details,
    breakFirst,
    summary: summaryParts.join("\n"),
    finalP95LatencyMs: finalP95,
    peakQueueDepth: peakQueueDepth(timeSeries),
    maxStockSyncLagMs,
  };
}
