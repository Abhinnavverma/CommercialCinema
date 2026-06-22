import Fastify from "fastify";
import { createDb } from "@commerical-cinema/schema";
import { createStockClient } from "@commerical-cinema/rpc";
import { MenuService } from "./services/menu-service.js";
import { createMenuController } from "./controllers/menu-controller.js";
import { registerMenuRoutes } from "./routes/menu-routes.js";
import {
  DEFAULT_DATABASE_URL,
  DEFAULT_MENU_SERVICE_PORT,
  DEFAULT_STOCK_SERVICE_GRPC_URL,
} from "./static/index.js";

const port = Number(process.env.MENU_SERVICE_PORT ?? DEFAULT_MENU_SERVICE_PORT);
const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
const stockGrpcUrl = process.env.STOCK_SERVICE_GRPC_URL ?? DEFAULT_STOCK_SERVICE_GRPC_URL;

const app = Fastify({ logger: true });
const db = createDb(databaseUrl);
const stockClient = createStockClient(stockGrpcUrl);

const menuService = new MenuService(db, stockClient);
await menuService.loadCatalog();

const menuController = createMenuController({
  menuService,
  log: (message, error) => app.log.error({ err: error }, message),
});
await registerMenuRoutes(app, { menuController });

app.get("/health", async () => ({ status: "ok", service: "menu-service" }));

app.addHook("onClose", async () => {
  stockClient.close();
});

app.listen({ port, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
