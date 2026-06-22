import { EVENTS, createWorker } from "@commerical-cinema/event-bus";
import type { BroadcastService } from "../services/broadcast-service.js";
import { WS_MESSAGE_TYPE } from "../static/index.js";

export function startItemZeroStockConsumer(redisUrl: string, broadcastService: BroadcastService) {
  return createWorker(EVENTS.ITEM_ZERO_STOCK, redisUrl, async (job) => {
    broadcastService.broadcast({
      type: WS_MESSAGE_TYPE.STOCK_ZERO,
      itemId: job.data.catalogItemId,
    });
  });
}
