import { EVENTS, createWorker } from "@commerical-cinema/event-bus";
import type { CartService } from "../services/cart-service.js";

// Decoupled cart clearance: rather than the Order Service synchronously calling
// DELETE /cart on the checkout hot-path, the Cart Service consumes OrderPlaced and
// clears the cart asynchronously, keeping checkout latency off this network hop.
export function startOrderPlacedConsumer(redisUrl: string, cartService: CartService) {
  return createWorker(EVENTS.ORDER_PLACED, redisUrl, async (job) => {
    await cartService.remove(job.data.userId);
  });
}
