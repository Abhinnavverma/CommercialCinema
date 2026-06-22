import { useCallback, useEffect, useState } from "react";
import { fetchAnalyticsDashboard, type AnalyticsDashboard } from "../../api/analytics.js";
import { useAuth } from "../../context/AuthContext.js";
import { ErrorBanner } from "../shared/ErrorBanner.js";

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function DataTable({
  headers,
  rows,
  emptyMessage,
}: {
  headers: string[];
  rows: (string | number)[][];
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-400">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm text-slate-300">
        <thead>
          <tr className="border-b border-slate-700 text-xs uppercase tracking-wide text-slate-500">
            {headers.map((header) => (
              <th key={header} className="px-3 py-2 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-slate-800/80">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-3 py-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AnalyticsDashboard() {
  const { adminToken } = useAuth();
  const [dashboard, setDashboard] = useState<AnalyticsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!adminToken) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await fetchAnalyticsDashboard(adminToken);
      setDashboard(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
      setDashboard(null);
    } finally {
      setLoading(false);
    }
  }, [adminToken]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const isEmpty = dashboard?.summary.totalOrders === 0;

  return (
    <section className="space-y-6 rounded border border-slate-800 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-white">Analytics Dashboard</h2>
          <p className="text-sm text-slate-400">
            Buying patterns from OrderPlaced events (screen, showtime, age group, top items).
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadDashboard()}
          disabled={loading || !adminToken}
          className="rounded border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:border-slate-400 disabled:opacity-50"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      {loading && !dashboard ? (
        <p className="text-sm text-slate-400">Loading analytics…</p>
      ) : null}

      {dashboard && isEmpty ? (
        <p className="text-sm text-slate-400">
          No analytics data yet. Place patron orders or run a simulation, then refresh.
        </p>
      ) : null}

      {dashboard && !isEmpty ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded border border-slate-800 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Total orders</p>
              <p className="mt-1 text-2xl font-medium text-white">{dashboard.summary.totalOrders}</p>
            </div>
            <div className="rounded border border-slate-800 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Total revenue</p>
              <p className="mt-1 text-2xl font-medium text-white">
                {formatPrice(dashboard.summary.totalRevenueCents)}
              </p>
            </div>
          </div>

          <div className="rounded border border-slate-800 p-4">
            <h3 className="text-sm font-medium text-white">Top items</h3>
            <div className="mt-3">
              <DataTable
                headers={["Item", "Qty sold", "Revenue"]}
                rows={dashboard.topItems.map((item) => [
                  item.name,
                  item.quantitySold,
                  formatPrice(item.revenueCents),
                ])}
                emptyMessage="No line items recorded yet."
              />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded border border-slate-800 p-4">
              <h3 className="text-sm font-medium text-white">Orders by screen</h3>
              <div className="mt-3">
                <DataTable
                  headers={["Screen", "Orders", "Revenue"]}
                  rows={dashboard.byScreen.map((row) => [
                    row.screenNumber,
                    row.orderCount,
                    formatPrice(row.revenueCents),
                  ])}
                  emptyMessage="No screen breakdown yet."
                />
              </div>
            </div>

            <div className="rounded border border-slate-800 p-4">
              <h3 className="text-sm font-medium text-white">Orders by age group</h3>
              <div className="mt-3">
                <DataTable
                  headers={["Age group", "Orders"]}
                  rows={dashboard.byAgeGroup.map((row) => [row.ageGroup, row.orderCount])}
                  emptyMessage="No age group data yet."
                />
              </div>
            </div>
          </div>

          <div className="rounded border border-slate-800 p-4">
            <h3 className="text-sm font-medium text-white">Orders by showtime</h3>
            <div className="mt-3">
              <DataTable
                headers={["Showtime", "Orders"]}
                rows={dashboard.byShowtime.map((row) => [
                  formatDate(row.showtime),
                  row.orderCount,
                ])}
                emptyMessage="No showtime breakdown yet."
              />
            </div>
          </div>

          <div className="rounded border border-slate-800 p-4">
            <h3 className="text-sm font-medium text-white">Recent orders</h3>
            <div className="mt-3">
              <DataTable
                headers={["Order", "Screen", "Showtime", "Items", "Revenue", "Recorded"]}
                rows={dashboard.recentOrders.map((order) => [
                  order.orderId.slice(0, 8),
                  order.screenNumber,
                  formatDate(order.showtime),
                  order.itemCount,
                  formatPrice(order.revenueCents),
                  formatDate(order.createdAt),
                ])}
                emptyMessage="No recent orders."
              />
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
