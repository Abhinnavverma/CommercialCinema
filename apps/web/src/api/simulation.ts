import { apiRequest } from "./client.js";

export type SimulationMode = "live" | "stub";

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

export type SimulationPreset = {
  id: string;
  label: string;
  description: string;
  config: ScenarioConfig;
};

export type QueueDepthSnapshot = {
  cartCleanup: number;
  analytics: number;
  itemZeroStock: number;
};

export type MetricsSnapshot = {
  timestampMs: number;
  ordersCompleted: number;
  ordersFailed: number;
  ordersPerSecond: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  statusCounts: Record<string, number>;
  queueDepths: QueueDepthSnapshot | null;
  redisStock: Record<string, number>;
  postgresStock: Record<string, number> | null;
  stockSyncLagMs: number;
  stockSyncMaxDelta: number;
  conflictRate: number;
};

export type BreakEvent = {
  timestampMs: number;
  metric: string;
  message: string;
  actual: number;
  threshold: number;
};

export type SimulationReport = {
  runId: string;
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
  status: "pending" | "running" | "completed" | "cancelled" | "failed";
  startedAt: string;
  completedAt?: string;
  error?: string;
  totalPatrons: number;
  completedOrders: number;
  failedOrders: number;
  liveMetrics: MetricsSnapshot;
  timeSeries: MetricsSnapshot[];
  report?: SimulationReport;
};

export function fetchSimulationPresets(token: string): Promise<{ presets: SimulationPreset[] }> {
  return apiRequest<{ presets: SimulationPreset[] }>("/admin/simulation/presets", { token });
}

export function startSimulation(
  config: ScenarioConfig,
  token: string,
): Promise<{ runId: string; status: string }> {
  return apiRequest<{ runId: string; status: string }>("/admin/simulation/run", {
    method: "POST",
    body: config,
    token,
  });
}

export function fetchSimulationRun(runId: string, token: string): Promise<SimulationRun> {
  return apiRequest<SimulationRun>(`/admin/simulation/runs/${runId}`, { token });
}

export function fetchSimulationReport(
  runId: string,
  token: string,
): Promise<{ report: SimulationReport; timeSeries: MetricsSnapshot[] }> {
  return apiRequest<{ report: SimulationReport; timeSeries: MetricsSnapshot[] }>(
    `/admin/simulation/runs/${runId}/report`,
    { token },
  );
}

export function cancelSimulation(runId: string, token: string): Promise<{ runId: string; status: string }> {
  return apiRequest<{ runId: string; status: string }>(`/admin/simulation/runs/${runId}`, {
    method: "DELETE",
    token,
  });
}
