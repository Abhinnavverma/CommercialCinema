export const DEFAULT_DIGITAL_TWIN_PORT = 3010;
export const DEFAULT_GATEWAY_URL = "http://localhost:3001";
export const DEFAULT_REDIS_URL = "redis://localhost:6379";
export const DEFAULT_DATABASE_URL = "postgresql://cinema:cinema@localhost:5433/cinema";

export const DEFAULT_WORKER_CONCURRENCY = 500;
export const DEFAULT_RUN_DURATION_SECONDS = 25;
export const METRICS_POLL_INTERVAL_MS = 1000;

export const P95_LATENCY_THRESHOLD_MS = 2000;
export const QUEUE_DEPTH_THRESHOLD = 500;
export const STOCK_SYNC_LAG_THRESHOLD_MS = 10000;

export const PRE_SHOW_OFFSET_MINUTES = 8;
export const PRE_SHOW_SIGMA_MINUTES = 4;
export const INTERMISSION_SIGMA_MINUTES = 2;
export const WINDOW_BEFORE_SHOW_MINUTES = 15;
export const WINDOW_AFTER_INTERMISSION_MINUTES = 5;

export const STOCK_AVAILABLE_KEY_PREFIX = "stock:available:";
export const STOCK_SCAN_COUNT = 200;

export const RUN_STATUS = {
  PENDING: "pending",
  RUNNING: "running",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  FAILED: "failed",
} as const;

export type RunStatus = (typeof RUN_STATUS)[keyof typeof RUN_STATUS];

export const SIMULATION_MODE = {
  LIVE: "live",
  STUB: "stub",
} as const;

export type SimulationMode = (typeof SIMULATION_MODE)[keyof typeof SIMULATION_MODE];

export const HTTP_STATUS_CREATED = 201;
export const HTTP_STATUS_CONFLICT = 409;
export const HTTP_STATUS_PAYMENT_REQUIRED = 402;

export const STUB_REDIS_DB = 15;
export const STUB_PAYMENT_LATENCY_MS = 0;
export const STUB_PAYMENT_SUCCESS_RATE = 1;

export const SIMULATION_ORDER_HEADER = "x-apexflo-simulation";
export const SIMULATION_ORDER_VALUE = "twin";
