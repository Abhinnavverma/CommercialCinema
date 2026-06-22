import type { FastifyReply, FastifyRequest } from "fastify";
import type { Cart, CartItem } from "@commerical-cinema/schema";
import { HTTP_STATUS } from "@commerical-cinema/core";
import { CartService } from "../services/cart-service.js";
import { ERROR_MESSAGES } from "../static/index.js";

type CartControllerDeps = {
  cartService: CartService;
};

function isValidCartItem(body: Partial<CartItem> | undefined): body is CartItem {
  if (!body) {
    return false;
  }

  const { catalogItemId, quantity, unitPriceCents, name } = body;

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

export function createCartController(deps: CartControllerDeps) {
  const { cartService } = deps;

  return {
    async getCart(request: FastifyRequest): Promise<Cart> {
      const items = await cartService.read(request.user.sub);
      return { items };
    },

    async addItem(request: FastifyRequest, reply: FastifyReply): Promise<Cart | void> {
      const body = request.body as Partial<CartItem> | undefined;

      if (!isValidCartItem(body)) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({ error: ERROR_MESSAGES.INVALID_CART_ITEM });
      }

      const userId = request.user.sub;
      const items = await cartService.read(userId);
      const existing = items.find((line) => line.catalogItemId === body.catalogItemId);

      if (existing) {
        existing.quantity = body.quantity;
        existing.unitPriceCents = body.unitPriceCents;
        existing.name = body.name;
      } else {
        items.push({
          catalogItemId: body.catalogItemId,
          quantity: body.quantity,
          unitPriceCents: body.unitPriceCents,
          name: body.name,
        });
      }

      await cartService.write(userId, items);
      return { items };
    },

    async removeItem(request: FastifyRequest, reply: FastifyReply): Promise<Cart | void> {
      const { catalogItemId } = (request.body ?? {}) as { catalogItemId?: string };

      if (!catalogItemId || typeof catalogItemId !== "string") {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({ error: ERROR_MESSAGES.CATALOG_ITEM_ID_REQUIRED });
      }

      const userId = request.user.sub;
      const items = await cartService.read(userId);
      const nextItems = items.filter((line) => line.catalogItemId !== catalogItemId);

      if (nextItems.length === items.length) {
        return reply
          .status(HTTP_STATUS.NOT_FOUND)
          .send({ error: ERROR_MESSAGES.cartItemNotFound(catalogItemId) });
      }

      if (nextItems.length === 0) {
        await cartService.remove(userId);
        return { items: [] };
      }

      await cartService.write(userId, nextItems);
      return { items: nextItems };
    },

    async clearCart(request: FastifyRequest, reply: FastifyReply): Promise<void> {
      await cartService.remove(request.user.sub);
      return reply.status(HTTP_STATUS.NO_CONTENT).send();
    },
  };
}

export type CartController = ReturnType<typeof createCartController>;
