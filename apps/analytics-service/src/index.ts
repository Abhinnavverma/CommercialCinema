import Fastify from "fastify";
import { registerJwt } from "@commerical-cinema/core";
import { createDb } from "@commerical-cinema/schema";
import { createAnalyticsController } from "./controllers/analytics-controller.js";
import { registerAnalyticsRoutes } from "./routes/analytics-routes.js";
import { AnalyticsService } from "./services/analytics-service.js";
import { createAnalyticsBatcher } from "./workers/analytics-batcher.js";
import { startAnalyticsConsumer } from "./consumers/analytics.consumer.js";
import {
  DEFAULT_ANALYTICS_SERVICE_PORT,
  DEFAULT_DATABASE_URL,
  DEFAULT_REDIS_URL,
} from "./static/index.js";

const port = Number(process.env.ANALYTICS_SERVICE_PORT ?? DEFAULT_ANALYTICS_SERVICE_PORT);
const redisUrl = process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;

const app = Fastify({ logger: true });
const db = createDb(databaseUrl);
const analyticsService = new AnalyticsService(db);

const analyticsController = createAnalyticsController({
  analyticsService,
  log: (message, error) => app.log.error({ err: error }, message),
});

await registerJwt(app);
await registerAnalyticsRoutes(app, { analyticsController });

const batcher = createAnalyticsBatcher({
  analyticsService,
  log: (message, error) => app.log.error({ err: error }, message),
});

batcher.start();
const analyticsWorker = startAnalyticsConsumer(redisUrl, batcher);

app.get("/health", async () => ({ status: "ok", service: "analytics-service" }));

app.addHook("onClose", async () => {
  await batcher.stop();
  await analyticsWorker.close();
});

app.listen({ port, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
