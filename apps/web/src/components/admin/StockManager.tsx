import { useCallback, useEffect, useState } from "react";
import { fetchAdminStock, setStockLevel, type StockLevel } from "../../api/stock.js";
import { useAuth } from "../../context/AuthContext.js";
import { useCinemaSocketContext } from "../../context/CinemaSocketContext.js";
import { ErrorBanner } from "../shared/ErrorBanner.js";

export function StockManager() {
  const { adminToken } = useAuth();
  const { clearZeroStock } = useCinemaSocketContext();
  const [items, setItems] = useState<StockLevel[]>([]);
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadStock = useCallback(async () => {
    if (!adminToken) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetchAdminStock(adminToken);
      setItems(response.items);
      setDrafts(Object.fromEntries(response.items.map((item) => [item.itemId, item.available])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stock");
    } finally {
      setLoading(false);
    }
  }, [adminToken]);

  useEffect(() => {
    void loadStock();
  }, [loadStock]);

  async function handleSave(itemId: string) {
    if (!adminToken) {
      return;
    }

    const quantity = drafts[itemId];
    if (quantity === undefined || !Number.isInteger(quantity) || quantity < 0) {
      setError("Quantity must be a non-negative integer");
      return;
    }

    setSavingId(itemId);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await setStockLevel(itemId, quantity, adminToken);
      setItems((prev) =>
        prev.map((item) => (item.itemId === itemId ? { ...item, available: result.available } : item)),
      );
      clearZeroStock();
      setSuccessMessage(`Updated ${itemId} to ${result.available} units.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update stock");
    } finally {
      setSavingId(null);
    }
  }

  function adjustDraft(itemId: string, delta: number) {
    setDrafts((prev) => {
      const current = prev[itemId] ?? 0;
      return { ...prev, [itemId]: Math.max(0, current + delta) };
    });
  }

  if (loading) {
    return <p className="text-slate-400">Loading stock levels...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Stock Management</h2>
        <button
          type="button"
          onClick={() => void loadStock()}
          className="rounded border border-slate-600 px-3 py-1.5 text-sm hover:bg-slate-800"
        >
          Refresh
        </button>
      </div>

      {error && <ErrorBanner message={error} />}
      {successMessage && (
        <div className="rounded border border-emerald-700/50 bg-emerald-950/30 px-4 py-2 text-sm text-emerald-300">
          {successMessage}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-700">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-slate-700 bg-slate-800/80 text-slate-400">
            <tr>
              <th className="px-4 py-2 font-medium">Item</th>
              <th className="px-4 py-2 font-medium">Current</th>
              <th className="px-4 py-2 font-medium">Set quantity</th>
              <th className="px-4 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.itemId} className="border-b border-slate-800">
                <td className="px-4 py-2">
                  <p className="font-medium">{item.name}</p>
                  <p className="text-xs text-slate-500">{item.itemId}</p>
                </td>
                <td className="px-4 py-2">{item.available}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => adjustDraft(item.itemId, -1)}
                      className="rounded border border-slate-600 px-2 py-0.5 hover:bg-slate-700"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={0}
                      value={drafts[item.itemId] ?? item.available}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [item.itemId]: Math.max(0, Number(e.target.value)),
                        }))
                      }
                      className="w-20 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-center"
                    />
                    <button
                      type="button"
                      onClick={() => adjustDraft(item.itemId, 1)}
                      className="rounded border border-slate-600 px-2 py-0.5 hover:bg-slate-700"
                    >
                      +
                    </button>
                  </div>
                </td>
                <td className="px-4 py-2">
                  <button
                    type="button"
                    disabled={savingId === item.itemId}
                    onClick={() => void handleSave(item.itemId)}
                    className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium hover:bg-emerald-500 disabled:opacity-40"
                  >
                    Save
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
