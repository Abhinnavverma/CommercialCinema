import Fastify from "fastify";
import { sql } from "drizzle-orm";
import { createDb } from "@commerical-cinema/schema";

const port = Number(process.env.API_PORT ?? 3000);
const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://cinema:cinema@localhost:5433/cinema";

const app = Fastify({ logger: true });
const db = createDb(databaseUrl);

app.get("/health", async () => ({ status: "ok" }));

app.get("/health/db", async (_request, reply) => {
  try {
    await db.execute(sql`SELECT 1`);
    return { status: "ok", database: "connected" };
  } catch (error) {
    app.log.error(error);
    return reply.status(503).send({ status: "error", database: "disconnected" });
  }
});

app.listen({ port, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
