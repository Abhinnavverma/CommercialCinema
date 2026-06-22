import type { FastifyInstance } from "fastify";
import { ROLES } from "@commerical-cinema/core";
import type { SimulationController } from "../controllers/simulation-controller.js";

export function registerSimulationRoutes(
  app: FastifyInstance,
  controller: SimulationController,
) {
  const adminGuard = { preHandler: [app.authenticate, app.requireRole(ROLES.ADMIN)] };

  app.get("/admin/simulation/presets", adminGuard, () => controller.listPresets());
  app.post("/admin/simulation/run", adminGuard, (request, reply) =>
    controller.startRun(request, reply),
  );
  app.get("/admin/simulation/runs/:runId", adminGuard, (request, reply) =>
    controller.getRun(request, reply),
  );
  app.get("/admin/simulation/runs/:runId/report", adminGuard, (request, reply) =>
    controller.getReport(request, reply),
  );
  app.delete("/admin/simulation/runs/:runId", adminGuard, (request, reply) =>
    controller.cancelRun(request, reply),
  );
}
