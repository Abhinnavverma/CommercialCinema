import type { Redis } from "ioredis";
import RedisClient from "ioredis";
import {
  DEFAULT_RUN_DURATION_SECONDS,
  DEFAULT_WORKER_CONCURRENCY,
  SIMULATION_MODE,
  SIMULATION_ORDER_HEADER,
  SIMULATION_ORDER_VALUE,
  STUB_REDIS_DB,
} from "../static/simulation.constants.js";
import type { OrderOutcome, ScenarioConfig, SimulationRun, VirtualPatron } from "../types.js";
import {
  computeDemandWindow,
  generateDemand,
  mapToWallTime,
  resolveInitialStock,
} from "./demand-generator.js";
import { createMetricsCollector } from "./metrics-collector.js";
import { buildReport } from "./report-builder.js";
import { createStubOrderPipeline, createStubStock } from "./stub-order-pipeline.js";

type LogFn = (message: string, error?: unknown) => void;

type TrafficDriverConfig = {
  gatewayUrl: string;
  redis: Redis;
  redisUrl: string;
  databaseUrl: string;
  log: LogFn;
};

function createStubRedis(redisUrl: string): Redis {
  return new RedisClient(redisUrl, { db: STUB_REDIS_DB, maxRetriesPerRequest: 3 });
}

async function setupLiveStock(
  gatewayUrl: string,
  adminToken: string,
  overrides: Record<string, number> | undefined,
): Promise<void> {
  const refillResponse = await fetch(`${gatewayUrl}/stock/refill`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      Accept: "application/json",
    },
  });

  if (!refillResponse.ok) {
    const body = await refillResponse.text();
    throw new Error(`Stock refill failed (${refillResponse.status}): ${body}`);
  }

  if (!overrides) {
    return;
  }

  for (const [itemId, quantity] of Object.entries(overrides)) {
    const response = await fetch(`${gatewayUrl}/admin/stock/${itemId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ quantity }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Stock override for ${itemId} failed (${response.status}): ${body}`);
    }
  }
}

async function signupPatron(
  gatewayUrl: string,
  patron: VirtualPatron,
): Promise<string> {
  const response = await fetch(`${gatewayUrl}/auth/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      ageGroup: patron.ageGroup,
      sessionId: patron.sessionId,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Patron signup failed (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as { token: string };
  return payload.token;
}

async function placeLiveOrder(
  gatewayUrl: string,
  patron: VirtualPatron,
  showtime: string,
): Promise<OrderOutcome> {
  const started = performance.now();
  const response = await fetch(`${gatewayUrl}/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${patron.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      [SIMULATION_ORDER_HEADER]: SIMULATION_ORDER_VALUE,
    },
    body: JSON.stringify({
      items: patron.items,
      screenNumber: patron.screenNumber,
      seatNumber: patron.seatNumber,
      showtime,
    }),
  });

  const outcome = {
    patronId: patron.patronId,
    statusCode: response.status,
    latencyMs: performance.now() - started,
    timestampMs: Date.now(),
    items: patron.items,
  };

  // #region agent log
  fetch("http://127.0.0.1:7934/ingest/10281c98-45a9-4434-af44-66409e08ac63", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "466456" },
    body: JSON.stringify({
      sessionId: "466456",
      hypothesisId: "A",
      location: "traffic-driver.ts:placeLiveOrder",
      message: "live order response",
      data: { statusCode: outcome.statusCode, latencyMs: Math.round(outcome.latencyMs) },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  return outcome;
}

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
  signal: AbortSignal,
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < tasks.length) {
      if (signal.aborted) {
        return;
      }
      const current = index;
      index += 1;
      results[current] = await tasks[current]!();
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

export type SimulationRunnerDeps = TrafficDriverConfig;

export function createSimulationRunner(deps: SimulationRunnerDeps) {
  const runs = new Map<string, SimulationRun>();

  async function executeRun(
    run: SimulationRun,
    adminToken: string | null,
  ): Promise<void> {
    const config = run.config;
    const patrons = generateDemand(config);
    const initialStock = resolveInitialStock(config);
    const { windowStartMs, windowEndMs } = computeDemandWindow(config);
    const runDurationMs = (config.runDurationSeconds ?? DEFAULT_RUN_DURATION_SECONDS) * 1000;
    const concurrency = config.workerConcurrency ?? DEFAULT_WORKER_CONCURRENCY;
    const runStartMs = Date.now();

    run.totalPatrons = patrons.length;
    run.status = "running";

    let metrics!: ReturnType<typeof createMetricsCollector>;
    let metricsInterval: ReturnType<typeof setInterval> | null = null;

    const startMetrics = (collector: ReturnType<typeof createMetricsCollector>) => {
      metrics = collector;
      metrics.startPolling();
      metricsInterval = setInterval(() => {
        run.liveMetrics = metrics.snapshot();
        run.timeSeries.push({ ...run.liveMetrics });
      }, 1000);
    };

    const signal = run.abortController.signal;

    try {
      if (config.mode === SIMULATION_MODE.LIVE) {
        startMetrics(
          createMetricsCollector({
            redis: deps.redis,
            redisUrl: deps.redisUrl,
            databaseUrl: deps.databaseUrl,
            initialStock,
            mode: config.mode,
            runStartedMs: runStartMs,
          }),
        );

        if (!adminToken) {
          throw new Error("Admin token required for live simulation");
        }
        await setupLiveStock(deps.gatewayUrl, adminToken, config.stockOverrides);

        const signupTasks = patrons.map(
          (patron) => async () => {
            if (signal.aborted) {
              return;
            }
            patron.token = await signupPatron(deps.gatewayUrl, patron);
          },
        );
        await runWithConcurrency(signupTasks, concurrency, signal);

        const wallSchedule = patrons.map((patron) => ({
          patron,
          fireAtMs: mapToWallTime(
            patron.scheduledAtMs,
            windowStartMs,
            windowEndMs,
            runStartMs,
            runDurationMs,
          ),
        }));

        let scheduleIndex = 0;
        while (scheduleIndex < wallSchedule.length && !signal.aborted) {
          const now = Date.now();
          const batch: VirtualPatron[] = [];

          while (
            scheduleIndex < wallSchedule.length &&
            wallSchedule[scheduleIndex]!.fireAtMs <= now
          ) {
            batch.push(wallSchedule[scheduleIndex]!.patron);
            scheduleIndex += 1;
          }

          if (batch.length > 0) {
            const orderTasks = batch.map(
              (patron) => async () => {
                if (signal.aborted || !patron.token) {
                  return;
                }
                const outcome = await placeLiveOrder(deps.gatewayUrl, patron, config.showtime);
                metrics.recordOutcome(outcome);
                if (outcome.statusCode === 201) {
                  run.completedOrders += 1;
                } else {
                  run.failedOrders += 1;
                }
              },
            );
            await runWithConcurrency(orderTasks, concurrency, signal);
          }

          if (scheduleIndex >= wallSchedule.length) {
            break;
          }

          const waitMs = Math.max(0, wallSchedule[scheduleIndex]!.fireAtMs - Date.now());
          await sleep(Math.min(waitMs, 250), signal);
        }
      } else {
        const stubRedis = createStubRedis(deps.redisUrl);
        const stubStock = createStubStock(stubRedis);
        await stubStock.refill(initialStock);
        const pipeline = createStubOrderPipeline(stubStock);

        startMetrics(
          createMetricsCollector({
            redis: deps.redis,
            redisUrl: deps.redisUrl,
            databaseUrl: deps.databaseUrl,
            initialStock,
            mode: config.mode,
            runStartedMs: runStartMs,
            readStock: () => stubStock.getLevels(),
          }),
        );

        const wallSchedule = patrons.map((patron) => ({
          patron,
          fireAtMs: mapToWallTime(
            patron.scheduledAtMs,
            windowStartMs,
            windowEndMs,
            runStartMs,
            runDurationMs,
          ),
        }));

        let scheduleIndex = 0;
        while (scheduleIndex < wallSchedule.length && !signal.aborted) {
          const now = Date.now();
          const batch: typeof wallSchedule = [];

          while (
            scheduleIndex < wallSchedule.length &&
            wallSchedule[scheduleIndex]!.fireAtMs <= now
          ) {
            batch.push(wallSchedule[scheduleIndex]!);
            scheduleIndex += 1;
          }

          if (batch.length > 0) {
            const orderTasks = batch.map(
              ({ patron }) => async () => {
                if (signal.aborted) {
                  return;
                }
                const outcome = await pipeline.placeOrder({
                  patronId: patron.patronId,
                  userId: patron.patronId,
                  items: patron.items,
                  screenNumber: patron.screenNumber,
                  seatNumber: patron.seatNumber,
                  showtime: config.showtime,
                });
                metrics.recordOutcome(outcome);
                if (outcome.statusCode === 201) {
                  run.completedOrders += 1;
                } else {
                  run.failedOrders += 1;
                }
              },
            );
            await runWithConcurrency(orderTasks, concurrency, signal);
          }

          if (scheduleIndex >= wallSchedule.length) {
            break;
          }

          const waitMs = Math.max(0, wallSchedule[scheduleIndex]!.fireAtMs - Date.now());
          await sleep(Math.min(waitMs, 250), signal);
        }

        const finalStock = await stubStock.getLevels();
        stubRedis.disconnect();

        run.liveMetrics = metrics.snapshot();
        run.timeSeries.push({ ...run.liveMetrics });

        run.report = buildReport({
          run,
          outcomes: metrics.getOutcomes(),
          initialStock,
          finalStock,
          timeSeries: run.timeSeries,
        });

        run.status = signal.aborted ? "cancelled" : "completed";
        run.completedAt = new Date().toISOString();
        return;
      }

      run.liveMetrics = metrics.snapshot();
      run.timeSeries.push({ ...run.liveMetrics });

      const finalStock = run.liveMetrics.redisStock;

      run.report = buildReport({
        run,
        outcomes: metrics.getOutcomes(),
        initialStock,
        finalStock,
        timeSeries: run.timeSeries,
      });

      run.status = signal.aborted ? "cancelled" : "completed";
      run.completedAt = new Date().toISOString();
    } catch (error) {
      run.status = "failed";
      run.error = error instanceof Error ? error.message : String(error);
      run.completedAt = new Date().toISOString();
      deps.log("Simulation run failed", error);
    } finally {
      if (metricsInterval) {
        clearInterval(metricsInterval);
      }
      metrics?.stopPolling();
    }
  }

  return {
    getRun(runId: string): SimulationRun | undefined {
      return runs.get(runId);
    },

    listRuns(): SimulationRun[] {
      return [...runs.values()];
    },

    startRun(config: ScenarioConfig, adminToken: string | null): SimulationRun {
      const runId = crypto.randomUUID();
      const run: SimulationRun = {
        runId,
        config,
        status: "pending",
        startedAt: new Date().toISOString(),
        totalPatrons: 0,
        completedOrders: 0,
        failedOrders: 0,
        liveMetrics: {
          timestampMs: Date.now(),
          ordersCompleted: 0,
          ordersFailed: 0,
          ordersPerSecond: 0,
          p50LatencyMs: 0,
          p95LatencyMs: 0,
          statusCounts: {},
          queueDepths: null,
          redisStock: {},
          postgresStock: null,
          stockSyncLagMs: 0,
          stockSyncMaxDelta: 0,
          conflictRate: 0,
        },
        timeSeries: [],
        abortController: new AbortController(),
      };

      runs.set(runId, run);
      void executeRun(run, adminToken);
      return run;
    },

    cancelRun(runId: string): SimulationRun | undefined {
      const run = runs.get(runId);
      if (!run || run.status !== "running") {
        return run;
      }
      run.abortController.abort();
      return run;
    },
  };
}

export type SimulationRunner = ReturnType<typeof createSimulationRunner>;
