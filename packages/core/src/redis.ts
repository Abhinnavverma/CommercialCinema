import Redis from "ioredis";

export function createRedis(url: string): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: 3,
    // Fail fast instead of queuing indefinitely when Redis is saturated (e.g. after a
    // digital-twin live run). BullMQ uses its own connection via event-bus, not this helper.
    commandTimeout: 5000,
  });
}

export type RedisClient = ReturnType<typeof createRedis>;
