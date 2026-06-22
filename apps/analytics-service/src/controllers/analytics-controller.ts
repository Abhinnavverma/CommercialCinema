import type { FastifyReply, FastifyRequest } from "fastify";
import { HTTP_STATUS } from "@commerical-cinema/core";
import type { AnalyticsService } from "../services/analytics-service.js";
import { ERROR_MESSAGES } from "../static/index.js";
import type { AnalyticsDashboard } from "../types.js";

type LogFn = (message: string, error?: unknown) => void;

type AnalyticsControllerDeps = {
  analyticsService: Pick<AnalyticsService, "getDashboard">;
  log: LogFn;
};

export function createAnalyticsController(deps: AnalyticsControllerDeps) {
  const { analyticsService, log } = deps;

  return {
    async getDashboard(
      _request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<AnalyticsDashboard | void> {
      try {
        return await analyticsService.getDashboard();
      } catch (error) {
        log("Failed to load analytics dashboard", error);
        return reply
          .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
          .send({ error: ERROR_MESSAGES.DASHBOARD_FAILED });
      }
    },
  };
}

export type AnalyticsController = ReturnType<typeof createAnalyticsController>;
