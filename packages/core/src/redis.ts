import Redis from "ioredis";

export function createRedis(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: 3 });
}

export type RedisClient = ReturnType<typeof createRedis>;
