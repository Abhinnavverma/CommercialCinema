import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { registerJwt } from "@commerical-cinema/core";
import {
  DEFAULT_CART_SERVICE_URL,
  DEFAULT_GATEWAY_PORT,
  DEFAULT_MENU_SERVICE_URL,
  DEFAULT_ORDER_SERVICE_URL,
  DEFAULT_USER_SERVICE_URL,
} from "./static/config.constants.js";

const port = Number(process.env.GATEWAY_PORT ?? DEFAULT_GATEWAY_PORT);
const userServiceUrl = process.env.USER_SERVICE_URL ?? DEFAULT_USER_SERVICE_URL;
const cartServiceUrl = process.env.CART_SERVICE_URL ?? DEFAULT_CART_SERVICE_URL;
const menuServiceUrl = process.env.MENU_SERVICE_URL ?? DEFAULT_MENU_SERVICE_URL;
const orderServiceUrl = process.env.ORDER_SERVICE_URL ?? DEFAULT_ORDER_SERVICE_URL;

const app = Fastify({ logger: true });

// Gateway is the only public ingress: it validates JWTs and forwards the request
// (including the Authorization header) downstream. Services re-verify for defense-in-depth.
// A native fetch proxy is used instead of @fastify/http-proxy because the latter relies on
// undici's Pool.request, which is not implemented under the Bun runtime.
async function forward(request: FastifyRequest, reply: FastifyReply, upstream: string) {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined || key === "host" || key === "content-length") {
      continue;
    }
    headers[key] = Array.isArray(value) ? value.join(",") : value;
  }

  const init: RequestInit = { method: request.method, headers };
  if (request.method !== "GET" && request.method !== "HEAD" && request.body != null) {
    headers["content-type"] = "application/json";
    init.body = typeof request.body === "string" ? request.body : JSON.stringify(request.body);
  }

  const upstreamResponse = await fetch(`${upstream}${request.url}`, init);
  const payload = await upstreamResponse.text();

  reply.status(upstreamResponse.status);
  const contentType = upstreamResponse.headers.get("content-type");
  if (contentType) {
    reply.header("content-type", contentType);
  }
  return reply.send(payload);
}

await registerJwt(app);

// Public auth surface -> User Service.
app.all("/auth/*", (request, reply) => forward(request, reply, userServiceUrl));

// Public menu browsing -> Menu Service (read path, no auth required).
app.get("/menu", (request, reply) => forward(request, reply, menuServiceUrl));
app.get("/menu/:id", (request, reply) => forward(request, reply, menuServiceUrl));

// Cart surface is patron-only; reject unauthenticated requests at the edge.
const patronGuard = { preHandler: [app.authenticate] };
app.all("/cart", patronGuard, (request, reply) => forward(request, reply, cartServiceUrl));
app.all("/cart/*", patronGuard, (request, reply) => forward(request, reply, cartServiceUrl));

// Checkout hot-path is patron-only; the Order Service re-verifies the JWT and role.
app.all("/orders", patronGuard, (request, reply) => forward(request, reply, orderServiceUrl));
// Order reads (GET /orders/:id) and cancellation (DELETE /orders/cancel).
app.all("/orders/*", patronGuard, (request, reply) => forward(request, reply, orderServiceUrl));

app.get("/health", async () => ({ status: "ok", service: "gateway" }));

app.listen({ port, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
