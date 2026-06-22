// The mock payment gateway sleeps this long before settling, simulating a real
// network round-trip to an external processor on the checkout hot path.
export const PAYMENT_LATENCY_MS = 500;

// Fraction of charges the mock gateway approves; the remainder are declined so the
// reservation-release path is exercised under load tests.
export const PAYMENT_SUCCESS_RATE = 0.85;

// Persisted order status once payment has cleared (mirrors the orderStatusEnum).
export const ORDER_STATUS_PLACED = "placed";

// Terminal status after a patron cancels an order (mirrors the orderStatusEnum).
export const ORDER_STATUS_CANCELLED = "cancelled";

// An order may only be cancelled before the concession stand starts working it. Once
// it is 'preparing'/'ready'/'seat-delivered' the stock is physically committed and a
// release would oversell. ('pending' in the spec maps to 'payment_pending'.)
export const CANCELLABLE_STATUSES = ["payment_pending", "placed"] as const;

// Mirrors the decrement-stock.lua return codes consumed during reservation.
export const STOCK_DECREMENT_RESULT = {
  SUCCESS: 1,
  INSUFFICIENT: 0,
  NOT_FOUND: -1,
} as const;
