import { QUEUES, createNamedWorker } from "@commerical-cinema/event-bus";
import type { OrderPlacedEvent } from "@commerical-cinema/event-bus";
import type { CartService } from "../services/cart-service.js";

// Decoupled cart clearance: rather than the Order Service synchronously calling
// DELETE /cart on the checkout hot-path, the Cart Service consumes OrderPlaced and
// clears the cart asynchronously, keeping checkout latency off this network hop.
export function startCartCleanupConsumer(redisUrl: string, cartService: CartService) {
  return createNamedWorker<OrderPlacedEvent>(QUEUES.CART_CLEANUP, redisUrl, async (job) => {
    await cartService.remove(job.data.userId);
  });
}
