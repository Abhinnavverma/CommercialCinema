import type { FastifyInstance } from "fastify";
import type { MenuController } from "../controllers/menu-controller.js";

type MenuRoutesOptions = {
  menuController: MenuController;
};

export async function registerMenuRoutes(app: FastifyInstance, options: MenuRoutesOptions) {
  const { menuController } = options;
  app.get("/menu", menuController.getMenu);
  app.get("/menu/:id", menuController.getMenuItem);
}
