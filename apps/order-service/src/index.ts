import Fastify from "fastify";
import { registerJwt } from "@commerical-cinema/core";
import { createDb } from "@commerical-cinema/schema";
import { EVENTS, QUEUES, createNamedQueue } from "@commerical-cinema/event-bus";
import type { OrderPlacedEvent } from "@commerical-cinema/event-bus";
import { createStockClient } from "@commerical-cinema/rpc";
import { OrderService } from "./services/order-service.js";
import { createOrderController } from "./controllers/order-controller.js";
import { registerOrderRoutes } from "./routes/order-routes.js";
import { chargePayment } from "./payment/mockStripe.js";
import {
  DEFAULT_DATABASE_URL,
  DEFAULT_ORDER_SERVICE_PORT,
  DEFAULT_REDIS_URL,
  DEFAULT_STOCK_SERVICE_GRPC_URL,
} from "./static/index.js";

const port = Number(process.env.ORDER_SERVICE_PORT ?? DEFAULT_ORDER_SERVICE_PORT);
const redisUrl = process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
const stockGrpcUrl = process.env.STOCK_SERVICE_GRPC_URL ?? DEFAULT_STOCK_SERVICE_GRPC_URL;

const app = Fastify({ logger: true });
const db = createDb(databaseUrl);
const stockClient = createStockClient(stockGrpcUrl);
const cartCleanupQueue = createNamedQueue<OrderPlacedEvent>(QUEUES.CART_CLEANUP, redisUrl);
const analyticsQueue = createNamedQueue<OrderPlacedEvent>(QUEUES.ANALYTICS, redisUrl);

const orderService = new OrderService(db);

await registerJwt(app);

const orderController = createOrderController({
  orderService,
  stockClient,
  cartCleanupQueue,
  analyticsQueue,
  charge: chargePayment,
  log: (message, error) => app.log.error({ err: error }, message),
});
await registerOrderRoutes(app, { orderController });

app.get("/health", async () => ({ status: "ok", service: "order-service" }));

app.addHook("onClose", async () => {
  await cartCleanupQueue.close();
  await analyticsQueue.close();
  stockClient.close();
});

app.listen({ port, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
