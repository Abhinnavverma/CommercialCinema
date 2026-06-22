#!/usr/bin/env bun

import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { startStack, type StackScript } from "./stack-supervisor.js";

const root = join(import.meta.dir, "..");
const composeFile = join(root, "docker", "docker-compose.yml");
const envPath = join(root, ".env");
const envExamplePath = join(root, ".env.example");
const nodeModulesPath = join(root, "node_modules");

const GATEWAY_HEALTH_URL = "http://localhost:3001/health";
const HEALTH_TIMEOUT_MS = 90_000;
const HEALTH_POLL_MS = 500;

const PRODUCTION_STACK: StackScript[] = [
  { label: "stock-service", script: "start:stock", port: "3005 (HTTP) + 50051 (gRPC)" },
  { label: "user-service", script: "start:user", port: "3002" },
  { label: "menu-service", script: "start:menu", port: "3004" },
  { label: "cart-service", script: "start:cart", port: "3003" },
  { label: "order-service", script: "start:order", port: "3006" },
  { label: "analytics-service", script: "start:analytics", port: "3007" },
  { label: "notification-service", script: "start:notification", port: "3008 (HTTP + WebSocket /ws)" },
  { label: "digital-twin", script: "start:twin", port: "3010" },
  { label: "gateway", script: "start:gateway", port: "3001 (public ingress)" },
  { label: "web", script: "dev:web", port: "5173 (Patron + Admin UI)" },
];

async function commandExists(command: string): Promise<boolean> {
  const proc = Bun.spawn([command, "--version"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  return exitCode === 0;
}

async function runCommand(label: string, command: string[], cwd = root): Promise<void> {
  console.log(`\n→ ${label}`);
  const proc = Bun.spawn(command, {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
    env: process.env,
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`${label} failed (exit ${exitCode})`);
  }
}

function loadEnvFile(): void {
  if (!existsSync(envPath)) {
    return;
  }

  // Pre-load into process.env so this orchestrator can read ADMIN_* for the banner.
  const lines = readFileSync(envPath, "utf8");
  for (const line of lines.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

async function waitForDockerService(
  service: string,
  check: () => Promise<boolean>,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await check()) {
      console.log(`  ✓ ${service} is ready`);
      return;
    }
    await Bun.sleep(1_000);
  }

  throw new Error(`Timed out waiting for ${service}. Is Docker running?`);
}

async function waitForGateway(): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(GATEWAY_HEALTH_URL, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) {
        console.log("  ✓ gateway is ready");
        return;
      }
    } catch {
      // retry
    }
    await Bun.sleep(HEALTH_POLL_MS);
  }

  throw new Error(`Timed out waiting for gateway at ${GATEWAY_HEALTH_URL}`);
}

async function bootstrap(): Promise<void> {
  console.log("ApexFlo — one-command local bootstrap\n");

  if (!(await commandExists("docker"))) {
    throw new Error("Docker is required but was not found on PATH. Install Docker Desktop and retry.");
  }

  if (!existsSync(envPath)) {
    if (!existsSync(envExamplePath)) {
      throw new Error("Missing .env and .env.example — cannot bootstrap environment.");
    }
    copyFileSync(envExamplePath, envPath);
    console.log("→ Created .env from .env.example");
  }

  loadEnvFile();

  if (!existsSync(nodeModulesPath)) {
    await runCommand("Installing dependencies (bun install)", ["bun", "install"]);
  }

  await runCommand("Starting Postgres + Redis (docker compose)", [
    "docker",
    "compose",
    "-f",
    composeFile,
    "up",
    "-d",
  ]);

  await waitForDockerService("Postgres", async () => {
    const proc = Bun.spawn(
      ["docker", "compose", "-f", composeFile, "exec", "-T", "postgres", "pg_isready", "-U", "cinema", "-d", "cinema"],
      { stdout: "pipe", stderr: "pipe" },
    );
    return (await proc.exited) === 0;
  }, 60_000);

  await waitForDockerService("Redis", async () => {
    const proc = Bun.spawn(
      ["docker", "compose", "-f", composeFile, "exec", "-T", "redis", "redis-cli", "ping"],
      { stdout: "pipe", stderr: "pipe" },
    );
    const text = await new Response(proc.stdout).text();
    await proc.exited;
    return text.trim() === "PONG";
  }, 30_000);

  await runCommand("Applying database migrations", ["bun", "run", "db:migrate"]);
  await runCommand("Seeding Postgres catalog + inventory", ["bun", "run", "db:seed"]);
  await runCommand("Seeding Redis hot-path stock", ["bun", "run", "seed:redis"]);
}

function printReadyBanner(): void {
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@apexflo.local";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "admin123";

  console.log("\n══════════════════════════════════════════════════════════");
  console.log("  ApexFlo is ready");
  console.log("══════════════════════════════════════════════════════════");
  console.log(`  Patron + Admin UI : http://localhost:5173`);
  console.log(`  API Gateway       : http://localhost:3001`);
  console.log(`  Digital Twin API  : http://localhost:3010`);
  console.log(`  Admin login       : ${adminEmail} / ${adminPassword}`);
  console.log("  Simulation        : Admin tab → Digital Twin Simulator");
  console.log("══════════════════════════════════════════════════════════\n");
}

try {
  await bootstrap();

  const { waitForever } = startStack({
    root,
    scripts: PRODUCTION_STACK,
    introLines: ["\n→ Starting microservices + web UI…"],
  });

  console.log("\n→ Waiting for gateway health…");
  await waitForGateway();
  printReadyBanner();

  await waitForever();
} catch (error) {
  console.error("\nBootstrap failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
