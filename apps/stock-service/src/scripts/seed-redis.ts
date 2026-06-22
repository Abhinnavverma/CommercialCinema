import { createRedis } from "@commerical-cinema/core";
import { SEED_PRODUCTS } from "@commerical-cinema/schema";
import { DEFAULT_REDIS_URL, buildStockKey } from "../static/index.js";

// Hydrates the hot-path stock counts in Redis (e.g. 1000 Popcorns) from the shared
// seed list, so the Stock Service has authoritative inventory the moment it boots.
const redisUrl = process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
const redis = createRedis(redisUrl);

try {
  const pipeline = redis.pipeline();
  for (const product of SEED_PRODUCTS) {
    pipeline.set(buildStockKey(product.id), String(product.initialStock));
  }
  await pipeline.exec();

  console.log(`Seeded ${SEED_PRODUCTS.length} stock keys in Redis`);
} catch (error) {
  console.error("Redis seed failed:", error);
  process.exit(1);
} finally {
  await redis.quit();
}
