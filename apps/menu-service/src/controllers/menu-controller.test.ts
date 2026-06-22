import { describe, expect, test } from "bun:test";
import type { FastifyReply, FastifyRequest } from "fastify";
import { HTTP_STATUS } from "@commerical-cinema/core";
import { createMenuController } from "./menu-controller.js";
import type { MenuItem, MenuService } from "../services/menu-service.js";
import { ERROR_MESSAGES } from "../static/index.js";

const popcornItem: MenuItem = {
  id: "popcorn-lg",
  name: "Large Popcorn",
  description: "Freshly popped",
  imageUrl: "https://images.apexflo.local/popcorn-lg.png",
  priceCents: 899,
  available: 42,
  inStock: true,
};

type CapturedReply = {
  statusCode?: number;
  payload?: unknown;
};

function fakeReply(captured: CapturedReply): FastifyReply {
  const reply = {
    status(code: number) {
      captured.statusCode = code;
      return reply;
    },
    send(payload?: unknown) {
      captured.payload = payload;
      return reply;
    },
  };
  return reply as unknown as FastifyReply;
}

function fakeRequest(id: string): FastifyRequest {
  return { params: { id } } as unknown as FastifyRequest;
}

type MenuServiceFake = Pick<MenuService, "getMenu" | "getMenuItem">;

function setup(getMenuItem: MenuServiceFake["getMenuItem"]) {
  const menuService: MenuServiceFake = {
    async getMenu() {
      return [];
    },
    getMenuItem,
  };
  const controller = createMenuController({ menuService, log: () => {} });
  return { controller };
}

describe("MenuController.getMenuItem", () => {
  test("returns the catalog item merged with live stock when found", async () => {
    const { controller } = setup(async (id) => (id === popcornItem.id ? popcornItem : null));
    const captured: CapturedReply = {};

    const result = await controller.getMenuItem(fakeRequest("popcorn-lg"), fakeReply(captured));

    expect(result).toEqual(popcornItem);
    expect(captured.statusCode).toBeUndefined();
  });

  test("returns 404 when the item is unknown or inactive", async () => {
    const { controller } = setup(async () => null);
    const captured: CapturedReply = {};

    await controller.getMenuItem(fakeRequest("missing"), fakeReply(captured));

    expect(captured.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
    expect(captured.payload).toEqual({ error: ERROR_MESSAGES.MENU_ITEM_NOT_FOUND });
  });

  test("returns 503 when the stock service is unreachable", async () => {
    const { controller } = setup(async () => {
      throw new Error("stock service down");
    });
    const captured: CapturedReply = {};

    await controller.getMenuItem(fakeRequest("popcorn-lg"), fakeReply(captured));

    expect(captured.statusCode).toBe(HTTP_STATUS.SERVICE_UNAVAILABLE);
  });
});
