import { EVENTS, createWorker } from "@commerical-cinema/event-bus";
import type { BroadcastService } from "../services/broadcast-service.js";
import { WS_MESSAGE_TYPE } from "../static/index.js";

export function startOrderStatusUpdatedConsumer(redisUrl: string, broadcastService: BroadcastService) {
  return createWorker(EVENTS.ORDER_STATUS_UPDATED, redisUrl, async (job) => {
    broadcastService.broadcast({
      type: WS_MESSAGE_TYPE.ORDER_STATUS_UPDATED,
      orderId: job.data.orderId,
      status: job.data.status,
    });
  });
}
