export const EVENTS = {
  ORDER_PLACED: "OrderPlaced",
  ITEM_ZERO_STOCK: "ItemZeroStock",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

export type OrderPlacedEvent = {
  orderId: string;
  userId: string;
  screenNumber: number;
  seatNumber: string;
  showtime: string;
  ageGroup?: string;
  items: { catalogItemId: string; quantity: number; unitPriceCents: number; name: string }[];
};

export type ItemZeroStockEvent = {
  catalogItemId: string;
};

export type EventPayloads = {
  [EVENTS.ORDER_PLACED]: OrderPlacedEvent;
  [EVENTS.ITEM_ZERO_STOCK]: ItemZeroStockEvent;
};
