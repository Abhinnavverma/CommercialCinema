export const QUEUES = {
  CART_CLEANUP: "CartCleanupQueue",
  ANALYTICS: "AnalyticsQueue",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
