import { useEffect, useMemo, useState } from "react";
import type { Order } from "@commerical-cinema/schema";
import { useCinemaSocketContext } from "../../context/CinemaSocketContext.js";
import { isCancellableOrderStatus, ORDER_PROGRESS } from "../../types/index.js";
import { ErrorBanner } from "../shared/ErrorBanner.js";
import { ProgressBar } from "../shared/ProgressBar.js";

const DISMISSED_ORDERS_KEY = "apexflo_dismissed_orders";

type OrderTrackingListProps = {
  orders: Order[];
  onDismiss: (orderId: string) => void;
  onCancel: (orderId: string) => Promise<void>;
};

function loadDismissed(): Set<string> {
  try {
    const raw = sessionStorage.getItem(DISMISSED_ORDERS_KEY);
    if (!raw) {
      return new Set();
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return new Set();
    }
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

function saveDismissed(dismissed: Set<string>): void {
  sessionStorage.setItem(DISMISSED_ORDERS_KEY, JSON.stringify([...dismissed]));
}

export function OrderTrackingList({ orders, onDismiss, onCancel }: OrderTrackingListProps) {
  const { orderStatuses } = useCinemaSocketContext();
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed());
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const visibleOrders = useMemo(
    () => orders.filter((order) => !dismissed.has(order.id)),
    [orders, dismissed],
  );

  useEffect(() => {
    saveDismissed(dismissed);
  }, [dismissed]);

  if (visibleOrders.length === 0) {
    return null;
  }

  function handleDismiss(orderId: string) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(orderId);
      return next;
    });
    onDismiss(orderId);
  }

  async function handleCancel(orderId: string) {
    setCancellingId(orderId);
    setCancelError(null);

    try {
      await onCancel(orderId);
    } catch (error) {
      setCancelError(error instanceof Error ? error.message : "Failed to cancel order");
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-emerald-300">Order Tracking</h2>
      {cancelError && <ErrorBanner message={cancelError} />}
      {visibleOrders.map((order) => {
        const status = orderStatuses.get(order.id) ?? order.status;
        const percent = ORDER_PROGRESS[status] ?? ORDER_PROGRESS.placed;
        const label = status.replace("-", " ");
        const canCancel = isCancellableOrderStatus(status);

        return (
          <div
            key={order.id}
            className="rounded-lg border border-emerald-700/50 bg-emerald-950/30 p-4"
            data-testid={`order-tracking-${order.id}`}
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">
                Screen {order.screenNumber} · Seat {order.seatNumber}
              </p>
              <div className="flex gap-2">
                {canCancel && (
                  <button
                    type="button"
                    disabled={cancellingId === order.id}
                    onClick={() => void handleCancel(order.id)}
                    className="text-xs text-red-400 hover:text-red-300 disabled:opacity-40"
                  >
                    {cancellingId === order.id ? "Cancelling..." : "Cancel Order"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDismiss(order.id)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Dismiss
                </button>
              </div>
            </div>
            <p className="mb-3 text-xs text-slate-400">Order {order.id.slice(0, 8)}...</p>
            <ProgressBar percent={percent} label={label} />
          </div>
        );
      })}
    </div>
  );
}
