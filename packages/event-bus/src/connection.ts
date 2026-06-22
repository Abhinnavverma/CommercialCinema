import { Redis } from "ioredis";

// BullMQ requires a blocking-capable connection: maxRetriesPerRequest MUST be null
// and ready checks disabled, otherwise workers throw on long-lived blocking commands.
export function createBusConnection(url: string): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}
