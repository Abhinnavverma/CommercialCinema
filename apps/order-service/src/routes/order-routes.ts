import type { FastifyInstance } from "fastify";
import { ROLES } from "@commerical-cinema/core";
import type { OrderController } from "../controllers/order-controller.js";

type OrderRoutesOptions = {
  orderController: OrderController;
};

export async function registerOrderRoutes(app: FastifyInstance, options: OrderRoutesOptions) {
  const { orderController } = options;
  const patronOnly = [app.authenticate, app.requireRole(ROLES.PATRON)];
  const adminOnly = [app.authenticate, app.requireRole(ROLES.ADMIN)];

  app.put("/orders/:id/status", { preHandler: adminOnly }, orderController.updateOrderStatus);
  app.post("/orders", { preHandler: patronOnly }, orderController.placeOrder);
  app.get("/orders", { preHandler: patronOnly }, orderController.listOrders);
  // Registered before "/orders/:id" so the literal "cancel" segment is never captured
  // as an order id.
  app.delete("/orders/cancel", { preHandler: patronOnly }, orderController.cancelOrder);
  app.get("/orders/:id", { preHandler: patronOnly }, orderController.getOrder);
}
