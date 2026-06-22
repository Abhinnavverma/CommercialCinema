export const STOCK_AVAILABLE_KEY_PREFIX = "stock:available:";

export function buildStockKey(itemId: string): string {
  return `${STOCK_AVAILABLE_KEY_PREFIX}${itemId}`;
}

// Mirrors the return codes of decrement-stock.lua.
export const DECREMENT_RESULT = {
  SUCCESS: 1,
  INSUFFICIENT: 0,
  NOT_FOUND: -1,
} as const;

// Write-behind cadence: Redis is the hot-path source of truth; Postgres is reconciled
// on this interval rather than on every decrement.
export const WRITE_BEHIND_INTERVAL_MS = 5000;

// SCAN page size while sweeping stock keys during a write-behind flush.
export const STOCK_SCAN_COUNT = 200;

// Name of the custom command registered on the Redis client via defineCommand.
export const DECREMENT_COMMAND = "decrementStock";
