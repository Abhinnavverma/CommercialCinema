import { Fragment, useCallback, useEffect, useState } from "react";
import type { Order, OrderItem } from "@commerical-cinema/schema";
import { fetchAdminOrder, fetchAdminOrders, updateOrderStatus } from "../../api/orders.js";
import { useAuth } from "../../context/AuthContext.js";
import { ADMIN_STATUS_TRANSITIONS } from "../../types/index.js";
import { ErrorBanner } from "../shared/ErrorBanner.js";

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(value: Date | string): string {
  return new Date(value).toLocaleString();
}

export function OrdersTable() {
  const { adminToken, logoutAdmin } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailItems, setDetailItems] = useState<OrderItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadOrders = useCallback(async () => {
    if (!adminToken) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetchAdminOrders(adminToken);
      setOrders(response.orders);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [adminToken]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  async function handleToggleDetail(orderId: string) {
    if (!adminToken) {
      return;
    }

    if (expandedId === orderId) {
      setExpandedId(null);
      setDetailItems([]);
      return;
    }

    setExpandedId(orderId);
    setDetailLoading(true);
    setError(null);

    try {
      const detail = await fetchAdminOrder(orderId, adminToken);
      setDetailItems(detail.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load order details");
      setExpandedId(null);
      setDetailItems([]);
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleAdvance(order: Order) {
    if (!adminToken) {
      return;
    }

    const nextStatus = ADMIN_STATUS_TRANSITIONS[order.status];
    if (!nextStatus) {
      return;
    }

    setUpdatingId(order.id);
    setError(null);

    try {
      await updateOrderStatus(order.id, nextStatus, adminToken);
      await loadOrders();
      if (expandedId === order.id) {
        const detail = await fetchAdminOrder(order.id, adminToken);
        setDetailItems(detail.items);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setUpdatingId(null);
    }
  }

  if (loading) {
    return <p className="text-slate-400">Loading orders...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Incoming Orders</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void loadOrders()}
            className="rounded border border-slate-600 px-3 py-1.5 text-sm hover:bg-slate-800"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={logoutAdmin}
            className="rounded border border-slate-600 px-3 py-1.5 text-sm hover:bg-slate-800"
          >
            Logout
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="overflow-x-auto rounded-lg border border-slate-700">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-slate-700 bg-slate-800/80 text-slate-400">
            <tr>
              <th className="px-4 py-2 font-medium">Order ID</th>
              <th className="px-4 py-2 font-medium">Screen</th>
              <th className="px-4 py-2 font-medium">Seat</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Total</th>
              <th className="px-4 py-2 font-medium">Created</th>
              <th className="px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  No orders yet.
                </td>
              </tr>
            ) : (
              orders.map((order) => {
                const nextStatus = ADMIN_STATUS_TRANSITIONS[order.status];
                const isExpanded = expandedId === order.id;

                return (
                  <Fragment key={order.id}>
                    <tr className="border-b border-slate-800">
                      <td className="px-4 py-2 font-mono text-xs">{order.id.slice(0, 8)}...</td>
                      <td className="px-4 py-2">{order.screenNumber}</td>
                      <td className="px-4 py-2">{order.seatNumber}</td>
                      <td className="px-4 py-2 capitalize">{order.status}</td>
                      <td className="px-4 py-2">{formatPrice(order.totalCents)}</td>
                      <td className="px-4 py-2 text-slate-400">{formatDate(order.createdAt)}</td>
                      <td className="px-4 py-2">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => void handleToggleDetail(order.id)}
                            className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800"
                          >
                            {isExpanded ? "Hide" : "Details"}
                          </button>
                          {nextStatus ? (
                            <button
                              type="button"
                              disabled={updatingId === order.id}
                              onClick={() => void handleAdvance(order)}
                              className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium hover:bg-emerald-500 disabled:opacity-40"
                            >
                              → {nextStatus}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-b border-slate-800 bg-slate-900/50">
                        <td colSpan={7} className="px-4 py-3">
                          {detailLoading ? (
                            <p className="text-slate-400">Loading items...</p>
                          ) : (
                            <div className="space-y-2">
                              <p className="text-xs text-slate-400">
                                Showtime: {formatDate(order.showtime)}
                              </p>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-slate-400">
                                    <th className="py-1 text-left font-medium">Item</th>
                                    <th className="py-1 text-left font-medium">Qty</th>
                                    <th className="py-1 text-left font-medium">Unit</th>
                                    <th className="py-1 text-left font-medium">Subtotal</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {detailItems.map((line) => (
                                    <tr key={line.id}>
                                      <td className="py-1">{line.itemName}</td>
                                      <td className="py-1">{line.quantity}</td>
                                      <td className="py-1">{formatPrice(line.unitPriceCents)}</td>
                                      <td className="py-1">
                                        {formatPrice(line.quantity * line.unitPriceCents)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
