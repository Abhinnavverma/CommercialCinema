# ApexFlo — In-Cinema Commerce Platform

High-throughput, event-driven cinema commerce engine with live stock-aware ordering, admin tooling, and a digital-twin load simulator.

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.1
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Postgres + Redis)
- Free ports: **3001–3010**, **5173**, **5433**, **6379**

## One-command local run

```bash
bun run start
```

This will:

1. Create `.env` from `.env.example` if missing
2. Run `bun install` if `node_modules` is absent
3. Start Postgres + Redis via Docker Compose
4. Migrate and seed the database + Redis stock
5. Launch all microservices and the web UI

When ready, open:

| What | URL |
|------|-----|
| **Patron + Admin UI** | http://localhost:5173 |
| **API Gateway** | http://localhost:3001 |
| **Digital Twin API** | http://localhost:3010 |

**Admin login** (default): `admin@apexflo.local` / `admin123`

Run a load simulation from **Admin → Digital Twin Simulator**.

## Development mode

For hot-reload during development, use two terminals:

```bash
bun run db:up
bun run db:migrate && bun run db:seed && bun run seed:redis
bun run dev:stack    # terminal 1 — backend services (watch mode)
bun run dev:web      # terminal 2 — Vite frontend
```

## Tests

```bash
bun run test
```

## Documentation

- [Design document](Docs/DESIGN_DOCS.md) — architecture, service boundaries, 25k walkthrough, ADRs
- [Benchmarks guide](Docs/BENCHMARKS.md) — how to read digital-twin simulation output

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Docker is required` | Start Docker Desktop, then re-run `bun run start` |
| Port already in use | Stop other processes on 3001–3010 / 5173, or change ports in `.env` |
| Empty menu / checkout fails | Ensure `bun run start` completed migrate + seed steps; check Docker containers are healthy |
| WebSocket stock updates missing | Confirm notification-service (3008) and gateway `/ws` proxy are running |

## Project structure

```
apps/
  gateway/          Public API ingress (JWT, proxy)
  user-service/     Auth + patron signup
  cart-service/     Redis carts + OrderPlaced consumer
  menu-service/     Catalog reads + live stock
  stock-service/    Atomic Redis inventory (Lua) + write-behind
  order-service/    Checkout hot path
  analytics-service/ Tier-1 analytics ingestion
  notification-service/ WebSocket fan-out
  digital-twin/     Load simulator
  web/              React patron + admin UI
packages/
  schema/           Drizzle schemas + seed data
  core/             JWT, Redis factory, shared constants
  event-bus/        BullMQ events + queues
  rpc/              gRPC stock client/proto
docker/
  docker-compose.yml  Postgres + Redis only
```
