import { useCallback, useEffect, useState } from "react";
import type { Order } from "@commerical-cinema/schema";
import { fetchPatronOrders, cancelPatronOrder } from "../../api/orders.js";
import { useAuth } from "../../context/AuthContext.js";
import { useCinemaSocketContext } from "../../context/CinemaSocketContext.js";
import { isTrackableOrderStatus } from "../../types/index.js";
import { CartProvider } from "../../context/CartContext.js";
import { ErrorBanner } from "../shared/ErrorBanner.js";
import { CartSidebar } from "./CartSidebar.js";
import { MenuGrid } from "./MenuGrid.js";
import { OrderTrackingList } from "./OrderTrackingList.js";
import { SocketStatusIndicator } from "./SocketStatusIndicator.js";

export function PatronView() {
  const { patronLoading, patronError, patronToken, patronReady } = useAuth();
  const { orderStatuses, connectionStatus } = useCinemaSocketContext();
  const [trackableOrders, setTrackableOrders] = useState<Order[]>([]);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const loadTrackableOrders = useCallback(async () => {
    if (!patronToken) {
      return;
    }

    const { orders } = await fetchPatronOrders(patronToken);
    setTrackableOrders(orders.filter((order) => isTrackableOrderStatus(order.status)));
  }, [patronToken]);

  useEffect(() => {
    if (patronReady && patronToken) {
      void loadTrackableOrders();
    }
  }, [patronReady, patronToken, loadTrackableOrders]);

  // Merge WebSocket status updates into displayed orders.
  useEffect(() => {
    if (orderStatuses.size === 0) {
      return;
    }
    setTrackableOrders((prev) =>
      prev
        .map((order) => {
          const wsStatus = orderStatuses.get(order.id);
          return wsStatus ? { ...order, status: wsStatus as Order["status"] } : order;
        })
        .filter((order) => isTrackableOrderStatus(order.status)),
    );
  }, [orderStatuses]);

  async function handleCancelOrder(orderId: string) {
    if (!patronToken) {
      return;
    }

    setCancelError(null);
    try {
      await cancelPatronOrder(orderId, patronToken);
      await loadTrackableOrders();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to cancel order";
      setCancelError(message);
      throw error;
    }
  }

  if (patronLoading && !patronToken) {
    return (
      <main className="mx-auto max-w-7xl p-6">
        <p className="text-slate-400">Connecting session...</p>
      </main>
    );
  }

  return (
    <CartProvider>
      <main className="mx-auto max-w-7xl p-6">
        {patronError && (
          <div className="mb-4">
            <ErrorBanner message={patronError} />
          </div>
        )}
        {cancelError && (
          <div className="mb-4">
            <ErrorBanner message={cancelError} />
          </div>
        )}

        <OrderTrackingList
          orders={trackableOrders}
          onDismiss={() => undefined}
          onCancel={handleCancelOrder}
        />

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
          <section>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Menu</h2>
              <SocketStatusIndicator status={connectionStatus} />
            </div>
            <MenuGrid />
          </section>
          <CartSidebar onOrderPlaced={() => void loadTrackableOrders()} />
        </div>
      </main>
    </CartProvider>
  );
}
