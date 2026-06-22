import type { FastifyReply, FastifyRequest } from "fastify";
import { HTTP_STATUS } from "@commerical-cinema/core";
import type { MenuItem, MenuService } from "../services/menu-service.js";
import { ERROR_MESSAGES } from "../static/index.js";

type LogFn = (message: string, error?: unknown) => void;

type MenuControllerDeps = {
  menuService: MenuService;
  log: LogFn;
};

export function createMenuController(deps: MenuControllerDeps) {
  const { menuService, log } = deps;

  return {
    async getMenu(_request: FastifyRequest, reply: FastifyReply): Promise<{ items: MenuItem[] } | void> {
      try {
        const items = await menuService.getMenu();
        return { items };
      } catch (error) {
        // If the Stock Service is unreachable we fail the read rather than serve stale
        // availability; the gateway/UI can retry. Catalog browsing is non-critical.
        log("Failed to build menu", error);
        return reply
          .status(HTTP_STATUS.SERVICE_UNAVAILABLE)
          .send({ error: ERROR_MESSAGES.STOCK_SERVICE_UNAVAILABLE });
      }
    },
  };
}

export type MenuController = ReturnType<typeof createMenuController>;
