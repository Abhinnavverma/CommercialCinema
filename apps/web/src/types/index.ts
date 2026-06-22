import type { Order } from "@commerical-cinema/schema";

export type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceCents: number;
  available: number;
  inStock: boolean;
};

export type MenuResponse = {
  items: MenuItem[];
};

export const WS_MESSAGE_TYPE = {
  STOCK_ZERO: "STOCK_ZERO",
  ORDER_STATUS_UPDATED: "ORDER_STATUS_UPDATED",
} as const;

export type StockZeroMessage = {
  type: typeof WS_MESSAGE_TYPE.STOCK_ZERO;
  itemId: string;
};

export type OrderStatusUpdatedMessage = {
  type: typeof WS_MESSAGE_TYPE.ORDER_STATUS_UPDATED;
  orderId: string;
  status: "preparing" | "ready" | "seat-delivered";
};

export type WsMessage = StockZeroMessage | OrderStatusUpdatedMessage;

export type FulfillmentStatus = "placed" | OrderStatusUpdatedMessage["status"] | Order["status"];

export const ORDER_PROGRESS: Record<string, number> = {
  placed: 25,
  preparing: 50,
  ready: 75,
  "seat-delivered": 100,
};

export const ADMIN_STATUS_TRANSITIONS: Record<string, string> = {
  placed: "preparing",
  preparing: "ready",
  ready: "seat-delivered",
};

export const TRACKABLE_ORDER_STATUSES = ["placed", "preparing", "ready"] as const;

export type TrackableOrderStatus = (typeof TRACKABLE_ORDER_STATUSES)[number];

export function isTrackableOrderStatus(status: string): status is TrackableOrderStatus {
  return (TRACKABLE_ORDER_STATUSES as readonly string[]).includes(status);
}

export const CANCELLABLE_ORDER_STATUSES = ["payment_pending", "placed"] as const;

export function isCancellableOrderStatus(status: string): boolean {
  return (CANCELLABLE_ORDER_STATUSES as readonly string[]).includes(status);
}
