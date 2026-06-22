import { describe, expect, test } from "bun:test";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { CartItem } from "@commerical-cinema/schema";
import { HTTP_STATUS } from "@commerical-cinema/core";
import { createCartController } from "./cart-controller.js";
import { CartService } from "../services/cart-service.js";
import { createMockRedis } from "../test/mock-redis.js";
import { CART_TTL_SECONDS } from "../static/index.js";

const userId = "user-123";

const popcorn: CartItem = {
  catalogItemId: "popcorn-lg",
  quantity: 2,
  unitPriceCents: 899,
  name: "Large Popcorn",
};

const soda: CartItem = {
  catalogItemId: "soda-md",
  quantity: 1,
  unitPriceCents: 499,
  name: "Medium Soda",
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

function fakeRequest(body?: unknown): FastifyRequest {
  return {
    user: { sub: userId, role: "patron" as const },
    body,
  } as unknown as FastifyRequest;
}

function setup() {
  const redis = createMockRedis();
  const cartService = new CartService(redis);
  const controller = createCartController({ cartService });
  return { redis, controller };
}

describe("CartController (business logic)", () => {
  test("getCart returns empty cart when nothing stored", async () => {
    const { controller } = setup();
    const cart = await controller.getCart(fakeRequest());
    expect(cart).toEqual({ items: [] });
  });

  test("addItem creates a new line and sets 3-hour TTL", async () => {
    const { controller, redis } = setup();
    const captured: CapturedReply = {};

    const cart = await controller.addItem(fakeRequest(popcorn), fakeReply(captured));

    expect(cart).toEqual({ items: [popcorn] });
    expect(redis.state.lastTtl).toBe(CART_TTL_SECONDS);
  });

  test("addItem on same catalogItemId updates quantity instead of duplicating", async () => {
    const { controller } = setup();
    const captured: CapturedReply = {};

    await controller.addItem(fakeRequest(popcorn), fakeReply(captured));
    const cart = await controller.addItem(
      fakeRequest({ ...popcorn, quantity: 5 }),
      fakeReply(captured),
    );

    expect(cart).toEqual({ items: [{ ...popcorn, quantity: 5 }] });
  });

  test("addItem rejects an invalid payload with 400", async () => {
    const { controller } = setup();
    const captured: CapturedReply = {};

    await controller.addItem(fakeRequest({ catalogItemId: "x", quantity: 0 }), fakeReply(captured));

    expect(captured.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
  });

  test("removeItem filters the array and re-applies TTL", async () => {
    const { controller, redis } = setup();
    const captured: CapturedReply = {};

    await controller.addItem(fakeRequest(popcorn), fakeReply(captured));
    await controller.addItem(fakeRequest(soda), fakeReply(captured));

    redis.state.ttlCalls = [];
    const cart = await controller.removeItem(
      fakeRequest({ catalogItemId: popcorn.catalogItemId }),
      fakeReply(captured),
    );

    expect(cart).toEqual({ items: [soda] });
    expect(redis.state.ttlCalls).toEqual([CART_TTL_SECONDS]);
  });

  test("removeItem on missing item returns 404", async () => {
    const { controller } = setup();
    const captured: CapturedReply = {};

    await controller.removeItem(
      fakeRequest({ catalogItemId: "missing" }),
      fakeReply(captured),
    );

    expect(captured.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
  });

  test("removeItem of the last item empties the cart", async () => {
    const { controller } = setup();
    const captured: CapturedReply = {};

    await controller.addItem(fakeRequest(popcorn), fakeReply(captured));
    const cart = await controller.removeItem(
      fakeRequest({ catalogItemId: popcorn.catalogItemId }),
      fakeReply(captured),
    );

    expect(cart).toEqual({ items: [] });
  });

  test("clearCart empties the cart and responds 204", async () => {
    const { controller } = setup();
    const captured: CapturedReply = {};

    await controller.addItem(fakeRequest(popcorn), fakeReply(captured));
    await controller.clearCart(fakeRequest(), fakeReply(captured));

    expect(captured.statusCode).toBe(HTTP_STATUS.NO_CONTENT);

    const cart = await controller.getCart(fakeRequest());
    expect(cart).toEqual({ items: [] });
  });

  test("TTL is re-applied on every mutating write", async () => {
    const { controller, redis } = setup();
    const captured: CapturedReply = {};

    await controller.addItem(fakeRequest(popcorn), fakeReply(captured));
    await controller.addItem(fakeRequest({ ...popcorn, quantity: 3 }), fakeReply(captured));
    await controller.addItem(fakeRequest(soda), fakeReply(captured));
    await controller.removeItem(
      fakeRequest({ catalogItemId: soda.catalogItemId }),
      fakeReply(captured),
    );

    expect(redis.state.ttlCalls.every((ttl) => ttl === CART_TTL_SECONDS)).toBe(true);
    expect(redis.state.ttlCalls.length).toBeGreaterThanOrEqual(3);
  });
});
