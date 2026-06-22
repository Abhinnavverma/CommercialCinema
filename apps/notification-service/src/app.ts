import Fastify, { type FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import type { Worker } from "@commerical-cinema/event-bus";
import { BroadcastService } from "./services/broadcast-service.js";
import { startItemZeroStockConsumer } from "./consumers/item-zero-stock.consumer.js";
import { startOrderStatusUpdatedConsumer } from "./consumers/order-status-updated.consumer.js";
import { DEFAULT_REDIS_URL, WS_PATH } from "./static/index.js";

export type NotificationApp = {
  app: FastifyInstance;
  broadcastService: BroadcastService;
  itemZeroStockWorker: Worker;
  orderStatusUpdatedWorker: Worker;
};

type BuildAppOptions = {
  redisUrl?: string;
  logger?: boolean;
};

export async function buildApp(options: BuildAppOptions = {}): Promise<NotificationApp> {
  const redisUrl = options.redisUrl ?? DEFAULT_REDIS_URL;
  const app = Fastify({ logger: options.logger ?? true });
  const broadcastService = new BroadcastService();

  await app.register(websocket);

  app.get(WS_PATH, { websocket: true }, (socket) => {
    broadcastService.add(socket);

    socket.on("close", () => {
      broadcastService.remove(socket);
    });
  });

  app.get("/health", async () => ({ status: "ok", service: "notification-service" }));

  const itemZeroStockWorker = startItemZeroStockConsumer(redisUrl, broadcastService);
  const orderStatusUpdatedWorker = startOrderStatusUpdatedConsumer(redisUrl, broadcastService);

  return { app, broadcastService, itemZeroStockWorker, orderStatusUpdatedWorker };
}

export async function listenApp(
  notificationApp: NotificationApp,
  port: number,
): Promise<string> {
  return notificationApp.app.listen({ port, host: "0.0.0.0" });
}

export function getWsUrl(port: number): string {
  return `ws://127.0.0.1:${port}${WS_PATH}`;
}
