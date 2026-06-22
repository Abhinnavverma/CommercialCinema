import type { CartRedis } from "../services/cart-service.js";

type StoredValue = {
  value: string;
  expiresAt?: number;
};

export type MockRedisState = {
  lastTtl?: number;
  ttlCalls: number[];
};

export function createMockRedis(): CartRedis & { state: MockRedisState } {
  const store = new Map<string, StoredValue>();
  const state: MockRedisState = { ttlCalls: [] };

  return {
    state,
    async get(key: string) {
      const entry = store.get(key);
      if (!entry) {
        return null;
      }

      if (entry.expiresAt !== undefined && Date.now() >= entry.expiresAt) {
        store.delete(key);
        return null;
      }

      return entry.value;
    },
    async set(key: string, value: string, mode: "EX", ttl: number) {
      if (mode !== "EX") {
        throw new Error("Mock redis only supports EX mode");
      }

      state.lastTtl = ttl;
      state.ttlCalls.push(ttl);

      store.set(key, {
        value,
        expiresAt: Date.now() + ttl * 1000,
      });
    },
    async del(key: string) {
      return store.delete(key) ? 1 : 0;
    },
  };
}
