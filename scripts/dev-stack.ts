#!/usr/bin/env bun

// Spawns backend microservices in dev watch mode. Run alongside `bun run dev:web`.

import { join } from "node:path";

import { startStack } from "./stack-supervisor.js";

const root = join(import.meta.dir, "..");

const { waitForever } = startStack({
  root,
  scripts: [
    { label: "stock-service", script: "dev:stock", port: "3005 (HTTP) + 50051 (gRPC)" },
    { label: "user-service", script: "dev:user", port: "3002" },
    { label: "menu-service", script: "dev:menu", port: "3004" },
    { label: "cart-service", script: "dev:cart", port: "3003" },
    { label: "order-service", script: "dev:order", port: "3006" },
    { label: "analytics-service", script: "dev:analytics", port: "3007" },
    {
      label: "notification-service",
      script: "dev:notification",
      port: "3008 (HTTP + WebSocket /ws — required for live stock updates)",
    },
    { label: "digital-twin", script: "dev:twin", port: "3010 (digital twin simulator)" },
    { label: "gateway", script: "dev:gateway", port: "3001 (public ingress; proxies /ws to notification-service)" },
  ],
  introLines: ["Run `bun run dev:web` separately for the Patron UI (http://localhost:5173)."],
});

await waitForever();
