import Fastify from "fastify";
import { sql } from "drizzle-orm";
import { createDb } from "@commerical-cinema/schema";
import { registerJwt, HTTP_STATUS } from "@commerical-cinema/core";
import { UserService } from "./services/user-service.js";
import { createAuthController } from "./controllers/auth-controller.js";
import { registerAuthRoutes } from "./routes/auth-routes.js";
import { DEFAULT_DATABASE_URL, DEFAULT_USER_SERVICE_PORT } from "./static/index.js";

const port = Number(process.env.USER_SERVICE_PORT ?? DEFAULT_USER_SERVICE_PORT);
const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;

const app = Fastify({ logger: true });
const db = createDb(databaseUrl);

const userService = new UserService(db);

await registerJwt(app);

const authController = createAuthController({ app, userService });
await registerAuthRoutes(app, { authController });

app.get("/health", async () => ({ status: "ok", service: "user-service" }));

app.get("/health/db", async (_request, reply) => {
  try {
    await db.execute(sql`SELECT 1`);
    return { status: "ok", database: "connected" };
  } catch (error) {
    app.log.error(error);
    return reply.status(HTTP_STATUS.SERVICE_UNAVAILABLE).send({ status: "error", database: "disconnected" });
  }
});

app.listen({ port, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
