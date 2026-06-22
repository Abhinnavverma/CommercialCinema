import Fastify from "fastify";
import { createRedis, registerJwt, HTTP_STATUS } from "@commerical-cinema/core";
import { CartService } from "./services/cart-service.js";
import { createCartController } from "./controllers/cart-controller.js";
import { registerCartRoutes } from "./routes/cart-routes.js";
import { startOrderPlacedConsumer } from "./consumers/order-placed.consumer.js";
import { DEFAULT_CART_SERVICE_PORT, DEFAULT_REDIS_URL } from "./static/index.js";

const port = Number(process.env.CART_SERVICE_PORT ?? DEFAULT_CART_SERVICE_PORT);
const redisUrl = process.env.REDIS_URL ?? DEFAULT_REDIS_URL;

const app = Fastify({ logger: true });
const redis = createRedis(redisUrl);

const cartService = new CartService(redis);

await registerJwt(app);

const cartController = createCartController({ cartService });
await registerCartRoutes(app, { cartController });

const orderPlacedWorker = startOrderPlacedConsumer(redisUrl, cartService);

app.get("/health", async () => ({ status: "ok", service: "cart-service" }));

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
  await orderPlacedWorker.close();
  await redis.quit();
});

app.listen({ port, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
