import type { CartItem } from "@commerical-cinema/schema";
import type { RunStatus, SimulationMode } from "./static/simulation.constants.js";

export type BasketRule = {
  itemId: string;
  p: number;
  qty: [number, number];
};

export type AudienceProfile = {
  name: string;
  weight: number;
  ageGroup: string;
  peaks: ("pre_show" | "intermission")[];
  basketRules: BasketRule[];
};

export type ScenarioConfig = {
  mode: SimulationMode;
  venue: { screens: number; seatsPerScreen: number; occupancy: number };
  showtime: string;
  intermissionAtMinutes?: number;
  windowMinutes: number;
  runDurationSeconds?: number;
  stockOverrides?: Record<string, number>;
  audienceProfiles: AudienceProfile[];
  workerConcurrency?: number;
};

export type VirtualPatron = {
  patronId: string;
  sessionId: string;
  screenNumber: number;
  seatNumber: string;
  ageGroup: string;
  profileName: string;
  scheduledAtMs: number;
  items: CartItem[];
  token?: string;
};

export type OrderOutcome = {
  patronId: string;
  statusCode: number;
  latencyMs: number;
  timestampMs: number;
  items: CartItem[];
};

export type QueueDepthSnapshot = {
  cartCleanup: number;
  analytics: number;
  itemZeroStock: number;
};

export type StockLevelSnapshot = Record<string, number>;

export type MetricsSnapshot = {
  timestampMs: number;
  ordersCompleted: number;
  ordersFailed: number;
  ordersPerSecond: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  statusCounts: Record<string, number>;
  queueDepths: QueueDepthSnapshot | null;
  redisStock: StockLevelSnapshot;
  postgresStock: StockLevelSnapshot | null;
  stockSyncLagMs: number;
  stockSyncMaxDelta: number;
  conflictRate: number;
};

export type TimeSeriesBucket = MetricsSnapshot;

export type BreakEvent = {
  timestampMs: number;
  metric: string;
  message: string;
  actual: number;
  threshold: number;
};

export type SimulationReport = {
  runId: string;
  scenarioName?: string;
  mode: SimulationMode;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  totalPatrons: number;
  ordersAttempted: number;
  ordersSucceeded: number;
  ordersFailed: number;
  oversellEvents: number;
  oversellDetails: { itemId: string; sold: number; initialStock: number }[];
  breakFirst: BreakEvent[];
  summary: string;
  finalP95LatencyMs: number;
  peakQueueDepth: QueueDepthSnapshot | null;
  maxStockSyncLagMs: number;
};

export type SimulationRun = {
  runId: string;
  config: ScenarioConfig;
  status: RunStatus;
  startedAt: string;
  completedAt?: string;
  error?: string;
  totalPatrons: number;
  completedOrders: number;
  failedOrders: number;
  liveMetrics: MetricsSnapshot;
  timeSeries: TimeSeriesBucket[];
  report?: SimulationReport;
  abortController: AbortController;
};
