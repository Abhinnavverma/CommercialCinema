import Fastify from "fastify";
import { createRedis, registerJwt } from "@commerical-cinema/core";
import { createSimulationController } from "./controllers/simulation-controller.js";
import { registerSimulationRoutes } from "./routes/simulation-routes.js";
import { createSimulationRunner } from "./services/traffic-driver.js";
import {
  DEFAULT_DATABASE_URL,
  DEFAULT_DIGITAL_TWIN_PORT,
  DEFAULT_GATEWAY_URL,
  DEFAULT_REDIS_URL,
} from "./static/index.js";

const port = Number(process.env.DIGITAL_TWIN_PORT ?? DEFAULT_DIGITAL_TWIN_PORT);
const gatewayUrl = process.env.GATEWAY_URL ?? DEFAULT_GATEWAY_URL;
const redisUrl = process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;

const app = Fastify({ logger: true });
await registerJwt(app);

const redis = createRedis(redisUrl);
const runner = createSimulationRunner({
  gatewayUrl,
  redis,
  redisUrl,
  databaseUrl,
  log: (message, error) => app.log.error({ err: error }, message),
});

const controller = createSimulationController(runner);
registerSimulationRoutes(app, controller);

app.get("/health", async () => ({ status: "ok", service: "digital-twin" }));

app.addHook("onClose", async () => {
  redis.disconnect();
});

app.listen({ port, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
