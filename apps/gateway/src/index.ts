import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import websocket from "@fastify/websocket";
import { registerJwt, ROLES } from "@commerical-cinema/core";
import {
  DEFAULT_CART_SERVICE_URL,
  DEFAULT_GATEWAY_PORT,
  DEFAULT_MENU_SERVICE_URL,
  DEFAULT_NOTIFICATION_SERVICE_WS_URL,
  DEFAULT_ORDER_SERVICE_URL,
  DEFAULT_ANALYTICS_SERVICE_URL,
  DEFAULT_DIGITAL_TWIN_SERVICE_URL,
  DEFAULT_STOCK_SERVICE_URL,
  DEFAULT_USER_SERVICE_URL,
  WS_UPSTREAM_MAX_ATTEMPTS,
  WS_UPSTREAM_RETRY_BASE_MS,
} from "./static/index.js";

const port = Number(process.env.GATEWAY_PORT ?? DEFAULT_GATEWAY_PORT);
const userServiceUrl = process.env.USER_SERVICE_URL ?? DEFAULT_USER_SERVICE_URL;
const cartServiceUrl = process.env.CART_SERVICE_URL ?? DEFAULT_CART_SERVICE_URL;
const menuServiceUrl = process.env.MENU_SERVICE_URL ?? DEFAULT_MENU_SERVICE_URL;
const orderServiceUrl = process.env.ORDER_SERVICE_URL ?? DEFAULT_ORDER_SERVICE_URL;
const analyticsServiceUrl = process.env.ANALYTICS_SERVICE_URL ?? DEFAULT_ANALYTICS_SERVICE_URL;
const stockServiceUrl = process.env.STOCK_SERVICE_URL ?? DEFAULT_STOCK_SERVICE_URL;
const digitalTwinServiceUrl =
  process.env.DIGITAL_TWIN_SERVICE_URL ?? DEFAULT_DIGITAL_TWIN_SERVICE_URL;
const notificationServiceWsUrl =
  process.env.NOTIFICATION_SERVICE_WS_URL ?? DEFAULT_NOTIFICATION_SERVICE_WS_URL;

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

  const targetUrl = `${upstream}${request.url}`;

  try {
    const upstreamResponse = await fetch(targetUrl, init);
    const payload = await upstreamResponse.text();

    reply.status(upstreamResponse.status);
    const contentType = upstreamResponse.headers.get("content-type");
    if (contentType) {
      reply.header("content-type", contentType);
    }
    return reply.send(payload);
  } catch (error) {
    request.log.error({ err: error, targetUrl }, "Upstream forward failed");
    return reply.status(503).send({
      error: `Upstream service unavailable (${upstream}). Ensure all services are running: bun run dev:stack`,
    });
  }
}

const WS_STATE_CONNECTING = 0;
const WS_STATE_OPEN = 1;

type ReadyStateLike = { readyState: number };

function isSocketOpen(socket: ReadyStateLike): boolean {
  return socket.readyState === WS_STATE_OPEN;
}

function isSocketActive(socket: ReadyStateLike): boolean {
  return socket.readyState === WS_STATE_OPEN || socket.readyState === WS_STATE_CONNECTING;
}

await registerJwt(app);
await app.register(websocket);

// Public auth surface -> User Service.
app.all("/auth/*", (request, reply) => forward(request, reply, userServiceUrl));

// Public menu browsing -> Menu Service (read path, no auth required).
app.get("/menu", (request, reply) => forward(request, reply, menuServiceUrl));
app.get("/menu/:id", (request, reply) => forward(request, reply, menuServiceUrl));

const adminGuard = { preHandler: [app.authenticate, app.requireRole(ROLES.ADMIN)] };
app.get("/admin/orders", adminGuard, (request, reply) => forward(request, reply, orderServiceUrl));
app.get("/admin/orders/:id", adminGuard, (request, reply) => forward(request, reply, orderServiceUrl));
app.get("/admin/analytics/dashboard", adminGuard, (request, reply) =>
  forward(request, reply, analyticsServiceUrl),
);
app.put("/orders/:id/status", adminGuard, (request, reply) => forward(request, reply, orderServiceUrl));
app.post("/stock/refill", adminGuard, (request, reply) => forward(request, reply, stockServiceUrl));
app.get("/admin/stock", adminGuard, (request, reply) => forward(request, reply, stockServiceUrl));
app.put("/admin/stock/:itemId", adminGuard, (request, reply) => forward(request, reply, stockServiceUrl));
app.all("/admin/simulation", adminGuard, (request, reply) =>
  forward(request, reply, digitalTwinServiceUrl),
);
app.all("/admin/simulation/*", adminGuard, (request, reply) =>
  forward(request, reply, digitalTwinServiceUrl),
);

// Patrons connect here; the gateway proxies server-push frames from the Notification Service.
app.get("/ws", { websocket: true }, (clientSocket, request) => {
  let upstream: WebSocket | null = null;
  let upstreamAttempt = 0;
  let upstreamRetryTimer: ReturnType<typeof setTimeout> | null = null;
  let tunnelClosed = false;
  const pendingFrames: string[] = [];

  const flushToClient = () => {
    if (!isSocketOpen(clientSocket)) {
      return;
    }
    while (pendingFrames.length > 0) {
      clientSocket.send(pendingFrames.shift()!);
    }
  };

  const relayToClient = (data: string) => {
    if (isSocketOpen(clientSocket)) {
      clientSocket.send(data);
      return;
    }
    if (clientSocket.readyState === WS_STATE_CONNECTING) {
      pendingFrames.push(data);
    }
  };

  const closeTunnel = () => {
    if (tunnelClosed) {
      return;
    }
    tunnelClosed = true;
    pendingFrames.length = 0;
    if (upstreamRetryTimer) {
      clearTimeout(upstreamRetryTimer);
      upstreamRetryTimer = null;
    }
    if (upstream && isSocketActive(upstream)) {
      upstream.close();
    }
    upstream = null;
    if (isSocketActive(clientSocket)) {
      clientSocket.close();
    }
  };

  const connectUpstream = () => {
    if (tunnelClosed) {
      return;
    }

    upstreamAttempt += 1;
    const attempt = upstreamAttempt;
    const socket = new WebSocket(notificationServiceWsUrl);
    let established = false;

    socket.addEventListener("open", () => {
      established = true;
      upstream = socket;
      upstreamAttempt = 0;
      flushToClient();
    });

    socket.addEventListener("message", (event) => {
      relayToClient(typeof event.data === "string" ? event.data : String(event.data));
      flushToClient();
    });

    socket.addEventListener("error", () => {
      request.log.error(
        { url: notificationServiceWsUrl, attempt },
        "Notification WebSocket upstream error",
      );
    });

    socket.addEventListener("close", () => {
      if (tunnelClosed) {
        return;
      }
      if (established && upstream === socket) {
        closeTunnel();
        return;
      }
      if (attempt >= WS_UPSTREAM_MAX_ATTEMPTS) {
        request.log.error(
          { url: notificationServiceWsUrl, attempts: attempt },
          "Notification WebSocket upstream unavailable after retries — is notification-service running on port 3008?",
        );
        closeTunnel();
        return;
      }
      request.log.warn(
        { url: notificationServiceWsUrl, attempt, maxAttempts: WS_UPSTREAM_MAX_ATTEMPTS },
        "Notification WebSocket upstream unavailable, retrying",
      );
      upstreamRetryTimer = setTimeout(connectUpstream, WS_UPSTREAM_RETRY_BASE_MS * attempt);
    });
  };

  connectUpstream();

  if (isSocketOpen(clientSocket)) {
    flushToClient();
  } else {
    clientSocket.on("open", flushToClient);
  }

  clientSocket.on("close", closeTunnel);
  clientSocket.on("error", closeTunnel);
});

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
