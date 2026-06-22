import { DEFAULT_NOTIFICATION_SERVICE_PORT, DEFAULT_REDIS_URL } from "./static/index.js";
import { buildApp, listenApp } from "./app.js";

const port = Number(process.env.NOTIFICATION_SERVICE_PORT ?? DEFAULT_NOTIFICATION_SERVICE_PORT);
const redisUrl = process.env.REDIS_URL ?? DEFAULT_REDIS_URL;

const notificationApp = await buildApp({ redisUrl });

const shutdown = async () => {
  await notificationApp.itemZeroStockWorker.close();
  await notificationApp.orderStatusUpdatedWorker.close();
  await notificationApp.app.close();
};

process.on("SIGINT", () => {
  shutdown().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  shutdown().finally(() => process.exit(0));
});

listenApp(notificationApp, port).catch((error) => {
  notificationApp.app.log.error(error);
  process.exit(1);
});
