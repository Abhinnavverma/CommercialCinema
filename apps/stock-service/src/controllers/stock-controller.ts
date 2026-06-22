import { status } from "@grpc/grpc-js";
import { EVENTS, type Queue } from "@commerical-cinema/event-bus";
import type { ItemZeroStockEvent } from "@commerical-cinema/event-bus";
import type { StockServiceHandlers } from "@commerical-cinema/rpc";
import type { StockService } from "../services/stock-service.js";
import { DECREMENT_RESULT, ERROR_MESSAGES } from "../static/index.js";

type LogFn = (message: string, error?: unknown) => void;

type StockControllerDeps = {
  stockService: StockService;
  zeroStockQueue: Queue<ItemZeroStockEvent>;
  log: LogFn;
};

// gRPC controllers: validate the request, call the service, map results to the wire
// response (and to gRPC status codes on error). All Redis access lives in the service.
export function createStockController(deps: StockControllerDeps): StockServiceHandlers {
  const { stockService, zeroStockQueue, log } = deps;

  return {
    GetStock(call, callback) {
      const itemIds = call.request.itemIds ?? [];
      stockService
        .getStock(itemIds)
        .then((stock) => {
          const levels = itemIds.map((itemId) => ({
            itemId,
            available: stock.get(itemId) ?? 0,
          }));
          callback(null, { levels });
        })
        .catch((error: unknown) => {
          log("GetStock failed", error);
          callback({ code: status.INTERNAL, details: ERROR_MESSAGES.GET_STOCK_FAILED }, null);
        });
    },

    Decrement(call, callback) {
      const { itemId, quantity } = call.request;

      if (!itemId || typeof itemId !== "string") {
        callback({ code: status.INVALID_ARGUMENT, details: ERROR_MESSAGES.ITEM_ID_REQUIRED }, null);
        return;
      }
      if (!Number.isInteger(quantity) || quantity <= 0) {
        callback({ code: status.INVALID_ARGUMENT, details: ERROR_MESSAGES.INVALID_QUANTITY }, null);
        return;
      }

      stockService
        .decrement(itemId, quantity)
        .then((outcome) => {
          // Bounded sync lag: the instant stock crosses to zero, publish ItemZeroStock
          // so the Notification Service can fan out a WebSocket update off the hot path.
          // Fire-and-forget: queue failure is non-critical and must not mask a successful
          // decrement (stock is already consumed; telling the caller it failed would cause
          // phantom inventory loss and incorrect retry behavior).
          if (outcome.code === DECREMENT_RESULT.SUCCESS && outcome.remaining === 0) {
            zeroStockQueue
              .add(EVENTS.ITEM_ZERO_STOCK, { catalogItemId: itemId })
              .catch((queueError: unknown) => {
                log("ItemZeroStock publish failed (decrement succeeded)", queueError);
              });
          }
          callback(null, { code: outcome.code, remaining: outcome.remaining });
        })
        .catch((error: unknown) => {
          log("Decrement failed", error);
          callback({ code: status.INTERNAL, details: ERROR_MESSAGES.DECREMENT_FAILED }, null);
        });
    },

    Release(call, callback) {
      const { itemId, quantity } = call.request;

      if (!itemId || typeof itemId !== "string") {
        callback({ code: status.INVALID_ARGUMENT, details: ERROR_MESSAGES.ITEM_ID_REQUIRED }, null);
        return;
      }
      if (!Number.isInteger(quantity) || quantity <= 0) {
        callback({ code: status.INVALID_ARGUMENT, details: ERROR_MESSAGES.INVALID_QUANTITY }, null);
        return;
      }

      stockService
        .release(itemId, quantity)
        .then((remaining) => {
          callback(null, { remaining });
        })
        .catch((error: unknown) => {
          log("Release failed", error);
          callback({ code: status.INTERNAL, details: ERROR_MESSAGES.RELEASE_FAILED }, null);
        });
    },
  };
}
