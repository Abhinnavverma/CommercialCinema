import type { FastifyReply, FastifyRequest } from "fastify";
import type { CartItem } from "@commerical-cinema/schema";
import { HTTP_STATUS } from "@commerical-cinema/core";
import { EVENTS, type Queue } from "@commerical-cinema/event-bus";
import type { OrderPlacedEvent, OrderStatusUpdatedEvent } from "@commerical-cinema/event-bus";
import type { StockClient } from "@commerical-cinema/rpc";
import type { OrderService } from "../services/order-service.js";
import type { PaymentGateway } from "../payment/mockStripe.js";
import { chargeSimulationPayment } from "../payment/mockStripe.js";
import {
  ADMIN_STATUS_TRANSITIONS,
  CANCELLABLE_STATUSES,
  ERROR_MESSAGES,
  ORDER_STATUS_CANCELLED,
  SIMULATION_REQUEST_HEADER,
  SIMULATION_REQUEST_VALUE,
  STOCK_DECREMENT_RESULT,
  type AdminTransitionFrom,
  type AdminTransitionTo,
} from "../static/index.js";

type LogFn = (message: string, error?: unknown) => void;

type OrderControllerDeps = {
  orderService: Pick<
    OrderService,
    | "createOrder"
    | "listOrders"
    | "listAllOrders"
    | "getOrderWithItems"
    | "cancelOrderIfEligible"
    | "updateOrderStatus"
    | "getOrderById"
  >;
  stockClient: Pick<StockClient, "decrement" | "release">;
  cartCleanupQueue: Pick<Queue<OrderPlacedEvent>, "add">;
  analyticsQueue: Pick<Queue<OrderPlacedEvent>, "add">;
  notificationQueue: Pick<Queue<OrderStatusUpdatedEvent>, "add">;
  charge: PaymentGateway;
  log: LogFn;
};

type PlaceOrderBody = {
  items?: unknown;
  screenNumber?: unknown;
  seatNumber?: unknown;
  showtime?: unknown;
};

type Reservation = { itemId: string; quantity: number };

function resolvePaymentGateway(request: FastifyRequest, fallback: PaymentGateway): PaymentGateway {
  const header = request.headers?.[SIMULATION_REQUEST_HEADER];
  const value = Array.isArray(header) ? header[0] : header;
  return value === SIMULATION_REQUEST_VALUE ? chargeSimulationPayment : fallback;
}

function isValidItem(value: unknown): value is CartItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const { catalogItemId, quantity, unitPriceCents, name } = value as Partial<CartItem>;

  return (
    typeof catalogItemId === "string" &&
    catalogItemId.length > 0 &&
    typeof quantity === "number" &&
    Number.isInteger(quantity) &&
    quantity > 0 &&
    typeof unitPriceCents === "number" &&
    Number.isInteger(unitPriceCents) &&
    unitPriceCents >= 0 &&
    typeof name === "string" &&
    name.length > 0
  );
}

export function createOrderController(deps: OrderControllerDeps) {
  const { orderService, stockClient, cartCleanupQueue, analyticsQueue, notificationQueue, charge, log } = deps;

  // Best-effort rollback of any units already reserved in Redis. Failures are logged
  // but never surfaced: the caller is already returning an error to the patron, and a
  // failed release must not mask the original out-of-stock / payment outcome.
  async function releaseAll(reserved: Reservation[]): Promise<void> {
    await Promise.all(
      reserved.map((line) =>
        stockClient.release({ itemId: line.itemId, quantity: line.quantity }).catch((error: unknown) => {
          log("Stock release failed during rollback", error);
        }),
      ),
    );
  }

  return {
    async placeOrder(request: FastifyRequest, reply: FastifyReply): Promise<void> {
      const body = (request.body ?? {}) as PlaceOrderBody;

      if (!Array.isArray(body.items) || body.items.length === 0) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({ error: ERROR_MESSAGES.EMPTY_CART });
      }
      if (!body.items.every(isValidItem)) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({ error: ERROR_MESSAGES.INVALID_ORDER_PAYLOAD });
      }

      const items = body.items as CartItem[];

      if (typeof body.screenNumber !== "number" || !Number.isInteger(body.screenNumber) || body.screenNumber <= 0) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({ error: ERROR_MESSAGES.INVALID_SCREEN });
      }
      if (typeof body.seatNumber !== "string" || body.seatNumber.length === 0) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({ error: ERROR_MESSAGES.INVALID_SEAT });
      }

      const showtime = typeof body.showtime === "string" ? new Date(body.showtime) : null;
      if (!showtime || Number.isNaN(showtime.getTime())) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({ error: ERROR_MESSAGES.INVALID_SHOWTIME });
      }

      const userId = request.user.sub;
      const totalCents = items.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0);

      // Step 1 - Reserve. Decrement each item atomically in the Stock Service. If any
      // item is short, roll back everything reserved so far and reject with 409.
      const reserved: Reservation[] = [];
      for (const line of items) {
        const outcome = await stockClient.decrement({ itemId: line.catalogItemId, quantity: line.quantity });
        if (outcome.code !== STOCK_DECREMENT_RESULT.SUCCESS) {
          await releaseAll(reserved);
          return reply.status(HTTP_STATUS.CONFLICT).send({ error: ERROR_MESSAGES.OUT_OF_STOCK });
        }
        reserved.push({ itemId: line.catalogItemId, quantity: line.quantity });
      }

      // Step 2 - Charge. A clean decline releases the reservation and returns 402; a
      // thrown/timed-out gateway is a transient failure, released and surfaced as 500.
      const paymentGateway = resolvePaymentGateway(request, charge);
      const simulationHeader = request.headers?.[SIMULATION_REQUEST_HEADER];
      const isSimulation =
        (Array.isArray(simulationHeader) ? simulationHeader[0] : simulationHeader) ===
        SIMULATION_REQUEST_VALUE;
      let payment;
      try {
        payment = await paymentGateway(totalCents);
      } catch (error) {
        log("Payment gateway error", error);
        await releaseAll(reserved);
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({ error: ERROR_MESSAGES.PAYMENT_GATEWAY_ERROR });
      }


      if (!payment.success) {
        await releaseAll(reserved);
        return reply.status(HTTP_STATUS.PAYMENT_REQUIRED).send({ error: ERROR_MESSAGES.PAYMENT_DECLINED });
      }

      // Step 3 - Commit. Reservation is now permanently consumed; persist to Postgres.
      const order = await orderService.createOrder({
        userId,
        totalCents,
        screenNumber: body.screenNumber,
        seatNumber: body.seatNumber,
        showtime,
        paymentRef: payment.paymentRef,
        items: items.map((line) => ({
          catalogItemId: line.catalogItemId,
          itemName: line.name,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
        })),
      });

      // Step 4 - Publish. OrderPlaced fans out cart-clearing and analytics off the hot
      // path. The order is already paid and committed, so a publish failure is logged
      // rather than failing the checkout response.
      const orderPlacedPayload: OrderPlacedEvent = {
        orderId: order.id,
        userId,
        screenNumber: body.screenNumber,
        seatNumber: body.seatNumber,
        showtime: showtime.toISOString(),
        ageGroup: request.user.ageGroup,
        items: items.map((line) => ({
          catalogItemId: line.catalogItemId,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          name: line.name,
        })),
      };

      try {
        await Promise.all([
          cartCleanupQueue.add(EVENTS.ORDER_PLACED, orderPlacedPayload),
          analyticsQueue.add(EVENTS.ORDER_PLACED, orderPlacedPayload),
        ]);
      } catch (error) {
        log("OrderPlaced publish failed (order committed)", error);
      }

      return reply.status(HTTP_STATUS.CREATED).send({
        orderId: order.id,
        status: order.status,
        totalCents: order.totalCents,
      });
    },

    async listOrders(request: FastifyRequest): Promise<{ orders: Awaited<ReturnType<OrderService["listOrders"]>> }> {
      const orders = await orderService.listOrders(request.user.sub);
      return { orders };
    },

    async listAllOrders(): Promise<{ orders: Awaited<ReturnType<OrderService["listAllOrders"]>> }> {
      const orders = await orderService.listAllOrders();
      return { orders };
    },

    async getOrder(request: FastifyRequest, reply: FastifyReply): Promise<void> {
      const { id } = request.params as { id: string };
      const result = await orderService.getOrderWithItems(id);

      // 404 (not 403) for a foreign order so we don't leak the existence of others' ids.
      if (!result || result.order.userId !== request.user.sub) {
        return reply.status(HTTP_STATUS.NOT_FOUND).send({ error: ERROR_MESSAGES.ORDER_NOT_FOUND });
      }

      return reply.status(HTTP_STATUS.OK).send({ order: result.order, items: result.items });
    },

    async getAdminOrder(request: FastifyRequest, reply: FastifyReply): Promise<void> {
      const { id } = request.params as { id: string };
      const result = await orderService.getOrderWithItems(id);

      if (!result) {
        return reply.status(HTTP_STATUS.NOT_FOUND).send({ error: ERROR_MESSAGES.ORDER_NOT_FOUND });
      }

      return reply.status(HTTP_STATUS.OK).send({ order: result.order, items: result.items });
    },

    async cancelOrder(request: FastifyRequest, reply: FastifyReply): Promise<void> {
      const { orderId } = (request.body ?? {}) as { orderId?: unknown };
      if (typeof orderId !== "string" || orderId.length === 0) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({ error: ERROR_MESSAGES.ORDER_ID_REQUIRED });
      }

      const userId = request.user.sub;
      const result = await orderService.getOrderWithItems(orderId);

      if (!result || result.order.userId !== userId) {
        return reply.status(HTTP_STATUS.NOT_FOUND).send({ error: ERROR_MESSAGES.ORDER_NOT_FOUND });
      }
      if (!CANCELLABLE_STATUSES.includes(result.order.status as (typeof CANCELLABLE_STATUSES)[number])) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({ error: ERROR_MESSAGES.ORDER_NOT_CANCELLABLE });
      }

      // Conditional update is the concurrency guard: only the winning request gets a row
      // back and is therefore the single caller allowed to release the stock.
      const cancelled = await orderService.cancelOrderIfEligible(userId, orderId, CANCELLABLE_STATUSES);
      if (!cancelled) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({ error: ERROR_MESSAGES.ORDER_NOT_CANCELLABLE });
      }

      // Return the reserved units to the available pool (Redis INCRBY via gRPC). Best-effort
      // and logged on failure: the order is already cancelled in Postgres.
      await releaseAll(
        result.items.map((line) => ({ itemId: line.catalogItemId, quantity: line.quantity })),
      );

      return reply.status(HTTP_STATUS.OK).send({ orderId: cancelled.id, status: ORDER_STATUS_CANCELLED });
    },

    async updateOrderStatus(request: FastifyRequest, reply: FastifyReply): Promise<void> {
      const { id } = request.params as { id: string };
      const { status } = (request.body ?? {}) as { status?: unknown };

      if (typeof status !== "string") {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({ error: ERROR_MESSAGES.INVALID_ORDER_STATUS });
      }

      const order = await orderService.getOrderById(id);
      if (!order) {
        return reply.status(HTTP_STATUS.NOT_FOUND).send({ error: ERROR_MESSAGES.ORDER_NOT_FOUND });
      }

      const currentStatus = order.status;
      const allowedNext = ADMIN_STATUS_TRANSITIONS[currentStatus as AdminTransitionFrom];
      if (!allowedNext || allowedNext !== status) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({ error: ERROR_MESSAGES.INVALID_STATUS_TRANSITION });
      }

      const updated = await orderService.updateOrderStatus(
        id,
        currentStatus,
        status as AdminTransitionTo,
      );
      if (!updated) {
        return reply.status(HTTP_STATUS.CONFLICT).send({ error: ERROR_MESSAGES.STATUS_CONFLICT });
      }

      const payload: OrderStatusUpdatedEvent = {
        orderId: updated.id,
        userId: updated.userId,
        status: status as OrderStatusUpdatedEvent["status"],
      };

      notificationQueue.add(EVENTS.ORDER_STATUS_UPDATED, payload).catch((error: unknown) => {
        log("OrderStatusUpdated publish failed (status committed)", error);
      });

      return reply.status(HTTP_STATUS.OK).send({ orderId: updated.id, status: updated.status });
    },
  };
}

export type OrderController = ReturnType<typeof createOrderController>;
