import type { FastifyInstance } from "fastify";
import { ROLES } from "@commerical-cinema/core";
import type { AnalyticsController } from "../controllers/analytics-controller.js";

type AnalyticsRoutesOptions = {
  analyticsController: AnalyticsController;
};

export async function registerAnalyticsRoutes(
  app: FastifyInstance,
  options: AnalyticsRoutesOptions,
) {
  const { analyticsController } = options;
  const adminOnly = [app.authenticate, app.requireRole(ROLES.ADMIN)];

  app.get("/admin/analytics/dashboard", { preHandler: adminOnly }, analyticsController.getDashboard);
}
