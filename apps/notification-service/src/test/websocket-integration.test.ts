import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Redis } from "ioredis";
import { EVENTS, createQueue } from "@commerical-cinema/event-bus";
import { buildApp, getWsUrl } from "../app.js";
import { DEFAULT_REDIS_URL, WS_MESSAGE_TYPE } from "../static/index.js";
import type { NotificationApp } from "../app.js";

const redisUrl = process.env.REDIS_URL ?? DEFAULT_REDIS_URL;

async function probeRedis(): Promise<boolean> {
  const probe = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  try {
    await probe.connect();
    const pong = await probe.ping();
    return pong === "PONG";
  } catch {
    return false;
  } finally {
    probe.disconnect();
  }
}

const reachable = await probeRedis();

function waitForMessage(
  socket: WebSocket,
  timeoutMs: number,
): Promise<{ data: string; elapsedMs: number }> {
  return new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const timer = setTimeout(() => {
      reject(new Error(`No WebSocket message within ${timeoutMs}ms`));
    }, timeoutMs);

    socket.addEventListener(
      "message",
      (event) => {
        clearTimeout(timer);
        resolve({
          data: typeof event.data === "string" ? event.data : String(event.data),
          elapsedMs: performance.now() - startedAt,
        });
      },
      { once: true },
    );
  });
}

async function connectSocket(port: number): Promise<WebSocket> {
  const socket = new WebSocket(getWsUrl(port));
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error("WebSocket connection failed")), {
      once: true,
    });
  });
  return socket;
}

describe.skipIf(!reachable)("NotificationService WebSocket fan-out (real Redis + BullMQ)", () => {
  let notificationApp: NotificationApp;
  let port: number;
  let zeroStockQueue: ReturnType<typeof createQueue<typeof EVENTS.ITEM_ZERO_STOCK>>;
  let orderStatusQueue: ReturnType<typeof createQueue<typeof EVENTS.ORDER_STATUS_UPDATED>>;

  beforeAll(async () => {
    notificationApp = await buildApp({ redisUrl, logger: false });
    await notificationApp.app.listen({ port: 0, host: "127.0.0.1" });
    const address = notificationApp.app.server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to resolve ephemeral notification-service port");
    }
    port = address.port;

    zeroStockQueue = createQueue(EVENTS.ITEM_ZERO_STOCK, redisUrl);
    orderStatusQueue = createQueue(EVENTS.ORDER_STATUS_UPDATED, redisUrl);
    await Promise.all([
      zeroStockQueue.obliterate({ force: true }),
      orderStatusQueue.obliterate({ force: true }),
      notificationApp.itemZeroStockWorker.waitUntilReady(),
      notificationApp.orderStatusUpdatedWorker.waitUntilReady(),
    ]);

    // Prime the BullMQ worker so the timed assertion measures fan-out, not cold-start latency.
    await zeroStockQueue.add(EVENTS.ITEM_ZERO_STOCK, { catalogItemId: "__warmup__" });
    await new Promise<void>((resolve) => {
      notificationApp.itemZeroStockWorker.once("completed", () => resolve());
    });
  });

  afterAll(async () => {
    notificationApp.broadcastService.closeAll();
    await Promise.all([zeroStockQueue.close(), orderStatusQueue.close()]);
    notificationApp.app.server.closeAllConnections();
    await Promise.all([
      notificationApp.itemZeroStockWorker.close(true),
      notificationApp.orderStatusUpdatedWorker.close(true),
    ]);
  });

  test("broadcasts STOCK_ZERO for ItemZeroStock within 50ms", async () => {
    const socket = await connectSocket(port);
    const messagePromise = waitForMessage(socket, 50);
    const enqueuedAt = performance.now();

    await zeroStockQueue.add(EVENTS.ITEM_ZERO_STOCK, { catalogItemId: "popcorn" });

    const { data, elapsedMs } = await messagePromise;
    expect(JSON.parse(data)).toEqual({ type: WS_MESSAGE_TYPE.STOCK_ZERO, itemId: "popcorn" });
    expect(elapsedMs).toBeLessThan(50);
    expect(performance.now() - enqueuedAt).toBeLessThan(50);

    socket.close();
  });

  test("broadcasts ORDER_STATUS_UPDATED for OrderStatusUpdated", async () => {
    const socket = await connectSocket(port);
    const messagePromise = waitForMessage(socket, 500);

    await orderStatusQueue.add(EVENTS.ORDER_STATUS_UPDATED, {
      orderId: "order-abc",
      userId: "user-123",
      status: "ready",
    });

    const { data } = await messagePromise;
    expect(JSON.parse(data)).toEqual({
      type: WS_MESSAGE_TYPE.ORDER_STATUS_UPDATED,
      orderId: "order-abc",
      status: "ready",
    });

    socket.close();
  });
});
