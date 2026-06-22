import { and, desc, eq, inArray } from "drizzle-orm";
import { orders, orderItems, type Db, type Order, type OrderItem } from "@commerical-cinema/schema";
import { ORDER_STATUS_CANCELLED, ORDER_STATUS_PLACED } from "../static/index.js";

export type OrderWithItems = {
  order: Order;
  items: OrderItem[];
};

export type OrderLineInput = {
  catalogItemId: string;
  itemName: string;
  quantity: number;
  unitPriceCents: number;
};

export type CreateOrderInput = {
  userId: string;
  totalCents: number;
  screenNumber: number;
  seatNumber: string;
  showtime: Date;
  paymentRef: string;
  items: OrderLineInput[];
};

export class OrderService {
  constructor(private readonly db: Db) {}

  // Persists the order header and its line items atomically. This runs only AFTER
  // payment has cleared, so it is a single write to cold storage (never a read on the
  // hot path) and represents the durable commit of a successful checkout.
  async createOrder(input: CreateOrderInput): Promise<Order> {
    return this.db.transaction(async (tx) => {
      const [order] = await tx
        .insert(orders)
        .values({
          userId: input.userId,
          status: ORDER_STATUS_PLACED,
          totalCents: input.totalCents,
          screenNumber: input.screenNumber,
          seatNumber: input.seatNumber,
          showtime: input.showtime,
          paymentRef: input.paymentRef,
        })
        .returning();

      if (!order) {
        throw new Error("Order insert returned no row");
      }

      await tx.insert(orderItems).values(
        input.items.map((line) => ({
          orderId: order.id,
          catalogItemId: line.catalogItemId,
          itemName: line.itemName,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
        })),
      );

      return order;
    });
  }

  // All orders for a patron, newest first. Cold-storage read (not the checkout hot path).
  async listOrders(userId: string): Promise<Order[]> {
    return this.db
      .select()
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt));
  }

  // Admin dashboard: every order across patrons, newest first.
  async listAllOrders(): Promise<Order[]> {
    return this.db.select().from(orders).orderBy(desc(orders.createdAt));
  }

  // Order header plus its line items, or null when the id is unknown. Ownership is
  // enforced by the controller so it can distinguish 404 from a foreign order.
  async getOrderWithItems(orderId: string): Promise<OrderWithItems | null> {
    const [order] = await this.db.select().from(orders).where(eq(orders.id, orderId));
    if (!order) {
      return null;
    }

    const items = await this.db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));

    return { order, items };
  }

  // Conditional cancellation: flips status to 'cancelled' only if the order still belongs
  // to the user AND is in a cancellable status. Returning the row proves this call (not a
  // racing one) won, so the caller can safely release stock exactly once.
  async cancelOrderIfEligible(
    userId: string,
    orderId: string,
    cancellableStatuses: readonly Order["status"][],
  ): Promise<Order | null> {
    const [order] = await this.db
      .update(orders)
      .set({ status: ORDER_STATUS_CANCELLED })
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.userId, userId),
          inArray(orders.status, [...cancellableStatuses]),
        ),
      )
      .returning();

    return order ?? null;
  }

  // Admin status progression: conditional update so a racing admin request loses cleanly.
  async updateOrderStatus(
    orderId: string,
    expectedStatus: Order["status"],
    newStatus: Order["status"],
  ): Promise<Order | null> {
    const [order] = await this.db
      .update(orders)
      .set({ status: newStatus })
      .where(and(eq(orders.id, orderId), eq(orders.status, expectedStatus)))
      .returning();

    return order ?? null;
  }

  async getOrderById(orderId: string): Promise<Order | null> {
    const [order] = await this.db.select().from(orders).where(eq(orders.id, orderId));
    return order ?? null;
  }
}
