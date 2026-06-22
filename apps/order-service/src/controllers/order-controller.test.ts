import { describe, expect, test } from "bun:test";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { CartItem, Order, OrderItem } from "@commerical-cinema/schema";
import { HTTP_STATUS } from "@commerical-cinema/core";
import { EVENTS } from "@commerical-cinema/event-bus";
import type { OrderPlacedEvent } from "@commerical-cinema/event-bus";
import type { Queue } from "@commerical-cinema/event-bus";
import type { StockClient } from "@commerical-cinema/rpc";
import { createOrderController } from "./order-controller.js";
import type { CreateOrderInput, OrderService, OrderWithItems } from "../services/order-service.js";
import type { PaymentGateway } from "../payment/mockStripe.js";
import { ORDER_STATUS_CANCELLED, STOCK_DECREMENT_RESULT } from "../static/index.js";

const userId = "user-123";
const ageGroup = "25-34";

const popcorn: CartItem = {
  catalogItemId: "popcorn-lg",
  quantity: 2,
  unitPriceCents: 899,
  name: "Large Popcorn",
};

const soda: CartItem = {
  catalogItemId: "soda-lg",
  quantity: 1,
  unitPriceCents: 549,
  name: "Large Soda",
};

const validBody = {
  items: [popcorn, soda],
  screenNumber: 5,
  seatNumber: "A12",
  showtime: "2026-07-01T20:15:00.000Z",
};

const expectedTotal = popcorn.quantity * popcorn.unitPriceCents + soda.quantity * soda.unitPriceCents;

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

function fakeRequest(body?: unknown, params?: unknown): FastifyRequest {
  return {
    user: { sub: userId, role: "patron" as const, ageGroup },
    body,
    params,
  } as unknown as FastifyRequest;
}

type SetupOptions = {
  charge?: PaymentGateway;
  insufficientFor?: string;
  listResult?: Order[];
  orderRecord?: OrderWithItems | null;
};

const noopCharge: PaymentGateway = async () => ({ success: true, paymentRef: "pay_noop" });

function setup(options: SetupOptions = {}) {
  const decrementCalls: { itemId: string; quantity: number }[] = [];
  const releaseCalls: { itemId: string; quantity: number }[] = [];
  const createOrderCalls: CreateOrderInput[] = [];
  const cancelCalls: { userId: string; orderId: string }[] = [];
  const publishedEvents: { name: string; data: OrderPlacedEvent }[] = [];

  const stockClient = {
    async decrement(request: { itemId: string; quantity: number }) {
      decrementCalls.push(request);
      const code =
        options.insufficientFor === request.itemId
          ? STOCK_DECREMENT_RESULT.INSUFFICIENT
          : STOCK_DECREMENT_RESULT.SUCCESS;
      return { code, remaining: 0 };
    },
    async release(request: { itemId: string; quantity: number }) {
      releaseCalls.push(request);
      return { remaining: 0 };
    },
  } satisfies Pick<StockClient, "decrement" | "release">;

  const orderService = {
    async createOrder(input: CreateOrderInput): Promise<Order> {
      createOrderCalls.push(input);
      return {
        id: "order-1",
        userId: input.userId,
        status: "placed",
        totalCents: input.totalCents,
        screenNumber: input.screenNumber,
        seatNumber: input.seatNumber,
        showtime: input.showtime,
        paymentRef: input.paymentRef,
        createdAt: new Date(),
      };
    },
    async listOrders(_userId: string): Promise<Order[]> {
      return options.listResult ?? [];
    },
    async getOrderWithItems(_orderId: string): Promise<OrderWithItems | null> {
      return options.orderRecord ?? null;
    },
    async cancelOrderIfEligible(
      uid: string,
      orderId: string,
      statuses: readonly Order["status"][],
    ): Promise<Order | null> {
      cancelCalls.push({ userId: uid, orderId });
      const record = options.orderRecord;
      // Mirror the conditional UPDATE: only flips when the order is owned and still in a
      // cancellable status (else the racing/ineligible caller gets null).
      if (!record || record.order.userId !== uid || !statuses.includes(record.order.status)) {
        return null;
      }
      return { ...record.order, status: ORDER_STATUS_CANCELLED };
    },
  } satisfies Pick<
    OrderService,
    "createOrder" | "listOrders" | "getOrderWithItems" | "cancelOrderIfEligible"
  >;

  const cartCleanupQueue = {
    async add(name: string, data: OrderPlacedEvent) {
      publishedEvents.push({ name, data });
      return undefined as unknown as Awaited<ReturnType<Queue<OrderPlacedEvent>["add"]>>;
    },
  } as unknown as Pick<Queue<OrderPlacedEvent>, "add">;

  const analyticsQueue = {
    async add(name: string, data: OrderPlacedEvent) {
      publishedEvents.push({ name, data });
      return undefined as unknown as Awaited<ReturnType<Queue<OrderPlacedEvent>["add"]>>;
    },
  } as unknown as Pick<Queue<OrderPlacedEvent>, "add">;

  const controller = createOrderController({
    orderService,
    stockClient,
    cartCleanupQueue,
    analyticsQueue,
    charge: options.charge ?? noopCharge,
    log: () => {},
  });

  return { controller, decrementCalls, releaseCalls, createOrderCalls, cancelCalls, publishedEvents };
}

const approve: PaymentGateway = async () => ({ success: true, paymentRef: "pay_test_123" });
const decline: PaymentGateway = async () => ({ success: false, reason: "declined" });
const explode: PaymentGateway = async () => {
  throw new Error("gateway unreachable");
};

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    userId,
    status: "placed",
    totalCents: expectedTotal,
    screenNumber: 5,
    seatNumber: "A12",
    showtime: new Date("2026-07-01T20:15:00.000Z"),
    paymentRef: "pay_test_123",
    createdAt: new Date(),
    ...overrides,
  };
}

const orderItemsFixture: OrderItem[] = [
  { id: "oi-1", orderId: "order-1", catalogItemId: popcorn.catalogItemId, itemName: popcorn.name, quantity: popcorn.quantity, unitPriceCents: popcorn.unitPriceCents },
  { id: "oi-2", orderId: "order-1", catalogItemId: soda.catalogItemId, itemName: soda.name, quantity: soda.quantity, unitPriceCents: soda.unitPriceCents },
];

function makeRecord(overrides: Partial<Order> = {}): OrderWithItems {
  return { order: makeOrder(overrides), items: orderItemsFixture };
}

describe("OrderController.placeOrder", () => {
  test("commits the order to Postgres and publishes OrderPlaced on payment success", async () => {
    const { controller, decrementCalls, releaseCalls, createOrderCalls, publishedEvents } = setup({
      charge: approve,
    });
    const captured: CapturedReply = {};

    await controller.placeOrder(fakeRequest(validBody), fakeReply(captured));

    // Reserved every item, released none.
    expect(decrementCalls).toEqual([
      { itemId: popcorn.catalogItemId, quantity: popcorn.quantity },
      { itemId: soda.catalogItemId, quantity: soda.quantity },
    ]);
    expect(releaseCalls).toEqual([]);

    // Persisted exactly once with the hydrated line items and computed total.
    expect(createOrderCalls).toHaveLength(1);
    const persisted = createOrderCalls[0];
    expect(persisted?.userId).toBe(userId);
    expect(persisted?.totalCents).toBe(expectedTotal);
    expect(persisted?.paymentRef).toBe("pay_test_123");
    expect(persisted?.items).toEqual([
      { catalogItemId: popcorn.catalogItemId, itemName: popcorn.name, quantity: popcorn.quantity, unitPriceCents: popcorn.unitPriceCents },
      { catalogItemId: soda.catalogItemId, itemName: soda.name, quantity: soda.quantity, unitPriceCents: soda.unitPriceCents },
    ]);

    // Published OrderPlaced to both cart-cleanup and analytics queues.
    expect(publishedEvents).toHaveLength(2);
    const expectedPayload = {
      orderId: "order-1",
      userId,
      screenNumber: validBody.screenNumber,
      seatNumber: validBody.seatNumber,
      showtime: validBody.showtime,
      ageGroup,
      items: [
        {
          catalogItemId: popcorn.catalogItemId,
          quantity: popcorn.quantity,
          unitPriceCents: popcorn.unitPriceCents,
          name: popcorn.name,
        },
        {
          catalogItemId: soda.catalogItemId,
          quantity: soda.quantity,
          unitPriceCents: soda.unitPriceCents,
          name: soda.name,
        },
      ],
    };
    expect(publishedEvents[0]?.name).toBe(EVENTS.ORDER_PLACED);
    expect(publishedEvents[0]?.data).toEqual(expectedPayload);
    expect(publishedEvents[1]?.name).toBe(EVENTS.ORDER_PLACED);
    expect(publishedEvents[1]?.data).toEqual(expectedPayload);

    expect(captured.statusCode).toBe(HTTP_STATUS.CREATED);
    expect(captured.payload).toEqual({ orderId: "order-1", status: "placed", totalCents: expectedTotal });
  });

  test("releases the reservation and returns 402 when the payment is declined", async () => {
    const { controller, releaseCalls, createOrderCalls, publishedEvents } = setup({ charge: decline });
    const captured: CapturedReply = {};

    await controller.placeOrder(fakeRequest(validBody), fakeReply(captured));

    // Every reserved unit is returned to the pool.
    expect(releaseCalls).toEqual([
      { itemId: popcorn.catalogItemId, quantity: popcorn.quantity },
      { itemId: soda.catalogItemId, quantity: soda.quantity },
    ]);
    // Nothing is committed and no event escapes on the failure path.
    expect(createOrderCalls).toHaveLength(0);
    expect(publishedEvents).toHaveLength(0);
    expect(captured.statusCode).toBe(HTTP_STATUS.PAYMENT_REQUIRED);
  });

  test("releases the reservation and returns 500 when the payment gateway throws", async () => {
    const { controller, releaseCalls, createOrderCalls } = setup({ charge: explode });
    const captured: CapturedReply = {};

    await controller.placeOrder(fakeRequest(validBody), fakeReply(captured));

    expect(releaseCalls).toEqual([
      { itemId: popcorn.catalogItemId, quantity: popcorn.quantity },
      { itemId: soda.catalogItemId, quantity: soda.quantity },
    ]);
    expect(createOrderCalls).toHaveLength(0);
    expect(captured.statusCode).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR);
  });

  test("rolls back already-reserved items and returns 409 when an item is out of stock", async () => {
    const { controller, releaseCalls, createOrderCalls } = setup({
      charge: approve,
      insufficientFor: soda.catalogItemId,
    });
    const captured: CapturedReply = {};

    await controller.placeOrder(fakeRequest(validBody), fakeReply(captured));

    // Popcorn was reserved first, then soda failed -> popcorn is released.
    expect(releaseCalls).toEqual([{ itemId: popcorn.catalogItemId, quantity: popcorn.quantity }]);
    expect(createOrderCalls).toHaveLength(0);
    expect(captured.statusCode).toBe(HTTP_STATUS.CONFLICT);
  });

  test("rejects an empty cart with 400 without touching stock", async () => {
    const { controller, decrementCalls } = setup({ charge: approve });
    const captured: CapturedReply = {};

    await controller.placeOrder(fakeRequest({ ...validBody, items: [] }), fakeReply(captured));

    expect(captured.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
    expect(decrementCalls).toHaveLength(0);
  });

  test("rejects an invalid showtime with 400", async () => {
    const { controller } = setup({ charge: approve });
    const captured: CapturedReply = {};

    await controller.placeOrder(fakeRequest({ ...validBody, showtime: "not-a-date" }), fakeReply(captured));

    expect(captured.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
  });
});

describe("OrderController.listOrders", () => {
  test("returns the authenticated user's orders", async () => {
    const orders = [makeOrder(), makeOrder({ id: "order-2" })];
    const { controller } = setup({ listResult: orders });

    const result = await controller.listOrders(fakeRequest());

    expect(result).toEqual({ orders });
  });
});

describe("OrderController.getOrder", () => {
  test("returns the order and its items when owned by the caller", async () => {
    const record = makeRecord();
    const { controller } = setup({ orderRecord: record });
    const captured: CapturedReply = {};

    await controller.getOrder(fakeRequest(undefined, { id: "order-1" }), fakeReply(captured));

    expect(captured.statusCode).toBe(HTTP_STATUS.OK);
    expect(captured.payload).toEqual({ order: record.order, items: record.items });
  });

  test("returns 404 when the order does not exist", async () => {
    const { controller } = setup({ orderRecord: null });
    const captured: CapturedReply = {};

    await controller.getOrder(fakeRequest(undefined, { id: "missing" }), fakeReply(captured));

    expect(captured.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
  });

  test("returns 404 when the order belongs to another user", async () => {
    const { controller } = setup({ orderRecord: makeRecord({ userId: "someone-else" }) });
    const captured: CapturedReply = {};

    await controller.getOrder(fakeRequest(undefined, { id: "order-1" }), fakeReply(captured));

    expect(captured.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
  });
});

describe("OrderController.cancelOrder", () => {
  test("cancels a placed order, restores stock to Redis, and returns 200", async () => {
    const { controller, releaseCalls, cancelCalls } = setup({ orderRecord: makeRecord({ status: "placed" }) });
    const captured: CapturedReply = {};

    await controller.cancelOrder(fakeRequest({ orderId: "order-1" }), fakeReply(captured));

    expect(cancelCalls).toEqual([{ userId, orderId: "order-1" }]);
    // Each reserved line is returned to the pool with its exact quantity (Redis INCRBY).
    expect(releaseCalls).toEqual([
      { itemId: popcorn.catalogItemId, quantity: popcorn.quantity },
      { itemId: soda.catalogItemId, quantity: soda.quantity },
    ]);
    expect(captured.statusCode).toBe(HTTP_STATUS.OK);
    expect(captured.payload).toEqual({ orderId: "order-1", status: "cancelled" });
  });

  test("returns 400 and restores no stock when the order is already preparing", async () => {
    const { controller, releaseCalls, cancelCalls } = setup({ orderRecord: makeRecord({ status: "preparing" }) });
    const captured: CapturedReply = {};

    await controller.cancelOrder(fakeRequest({ orderId: "order-1" }), fakeReply(captured));

    expect(captured.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
    // Guard rejects before the conditional update and before any stock release.
    expect(cancelCalls).toHaveLength(0);
    expect(releaseCalls).toEqual([]);
  });

  test("returns 400 when the order is already ready", async () => {
    const { controller, releaseCalls } = setup({ orderRecord: makeRecord({ status: "ready" }) });
    const captured: CapturedReply = {};

    await controller.cancelOrder(fakeRequest({ orderId: "order-1" }), fakeReply(captured));

    expect(captured.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
    expect(releaseCalls).toEqual([]);
  });

  test("returns 404 when cancelling another user's order", async () => {
    const { controller, releaseCalls } = setup({ orderRecord: makeRecord({ userId: "someone-else" }) });
    const captured: CapturedReply = {};

    await controller.cancelOrder(fakeRequest({ orderId: "order-1" }), fakeReply(captured));

    expect(captured.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
    expect(releaseCalls).toEqual([]);
  });

  test("returns 400 when orderId is missing from the payload", async () => {
    const { controller } = setup({ orderRecord: makeRecord() });
    const captured: CapturedReply = {};

    await controller.cancelOrder(fakeRequest({}), fakeReply(captured));

    expect(captured.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
  });
});
