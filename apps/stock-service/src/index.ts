import Fastify from "fastify";
import * as grpc from "@grpc/grpc-js";
import { createRedis, HTTP_STATUS } from "@commerical-cinema/core";
import { createDb } from "@commerical-cinema/schema";
import { EVENTS, createQueue } from "@commerical-cinema/event-bus";
import { stockServiceDefinition } from "@commerical-cinema/rpc";
import { StockService } from "./services/stock-service.js";
import { createStockController } from "./controllers/stock-controller.js";
import { startWriteBehindWorker } from "./workers/write-behind.worker.js";
import {
  DEFAULT_DATABASE_URL,
  DEFAULT_REDIS_URL,
  DEFAULT_STOCK_GRPC_ADDR,
  DEFAULT_STOCK_SERVICE_PORT,
} from "./static/index.js";

const port = Number(process.env.STOCK_SERVICE_PORT ?? DEFAULT_STOCK_SERVICE_PORT);
const grpcAddr = process.env.STOCK_GRPC_ADDR ?? DEFAULT_STOCK_GRPC_ADDR;
const redisUrl = process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;

const app = Fastify({ logger: true });
const redis = createRedis(redisUrl);
const db = createDb(databaseUrl);

const stockService = new StockService(redis);
const zeroStockQueue = createQueue(EVENTS.ITEM_ZERO_STOCK, redisUrl);

const stockController = createStockController({
  stockService,
  zeroStockQueue,
  log: (message, error) => app.log.error({ err: error }, message),
});

// gRPC server: the internal read/write surface (GetStock, Decrement). Not exposed via
// the public gateway; only the Menu and (future) Order services dial it.
const grpcServer = new grpc.Server();
grpcServer.addService(
  stockServiceDefinition,
  stockController as unknown as grpc.UntypedServiceImplementation,
);

grpcServer.bindAsync(grpcAddr, grpc.ServerCredentials.createInsecure(), (error, boundPort) => {
  if (error) {
    app.log.error(error);
    process.exit(1);
  }
  app.log.info(`Stock gRPC server listening on ${grpcAddr} (port ${boundPort})`);
});

const writeBehind = startWriteBehindWorker(redis, db, (message, error) =>
  app.log.error({ err: error }, message),
);

app.get("/health", async () => ({ status: "ok", service: "stock-service" }));

app.get("/health/redis", async (_request, reply) => {
  try {
    const pong = await redis.ping();
    if (pong !== "PONG") {
      return reply.status(HTTP_STATUS.SERVICE_UNAVAILABLE).send({ status: "error", redis: "disconnected" });
    }
    return { status: "ok", redis: "connected" };
  } catch (error) {
    app.log.error(error);
    return reply.status(HTTP_STATUS.SERVICE_UNAVAILABLE).send({ status: "error", redis: "disconnected" });
  }
});

app.addHook("onClose", async () => {
  writeBehind.stop();
  await zeroStockQueue.close();
  grpcServer.forceShutdown();
  await redis.quit();
});

app.listen({ port, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
