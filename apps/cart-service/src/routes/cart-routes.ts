import type { FastifyInstance } from "fastify";
import { ROLES } from "@commerical-cinema/core";
import type { CartController } from "../controllers/cart-controller.js";

type CartRoutesOptions = {
  cartController: CartController;
};

export async function registerCartRoutes(app: FastifyInstance, options: CartRoutesOptions) {
  const { cartController } = options;
  const patronOnly = [app.authenticate, app.requireRole(ROLES.PATRON)];

  app.get("/cart", { preHandler: patronOnly }, cartController.getCart);
  app.post("/cart/item", { preHandler: patronOnly }, cartController.addItem);
  app.delete("/cart/item", { preHandler: patronOnly }, cartController.removeItem);
  app.delete("/cart/clear", { preHandler: patronOnly }, cartController.clearCart);
}
