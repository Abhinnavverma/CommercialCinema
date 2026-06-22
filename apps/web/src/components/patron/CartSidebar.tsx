import { useState } from "react";
import { ApiError } from "../../api/client.js";
import { placeOrder } from "../../api/orders.js";
import { useAuth } from "../../context/AuthContext.js";
import { useCart } from "../../context/CartContext.js";
import { ErrorBanner } from "../shared/ErrorBanner.js";

type CartSidebarProps = {
  onOrderPlaced: () => void;
};

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function CartSidebar({ onOrderPlaced }: CartSidebarProps) {
  const { items, totalCents, updateQuantity, removeItem, clearCart } = useCart();
  const { patronToken } = useAuth();
  const [screenNumber, setScreenNumber] = useState(1);
  const [seatNumber, setSeatNumber] = useState("A12");
  const [showtime, setShowtime] = useState(() => new Date().toISOString().slice(0, 16));
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);

  async function handleCheckout() {
    if (!patronToken || items.length === 0) {
      return;
    }

    setCheckingOut(true);
    setCheckoutError(null);

    try {
      const response = await placeOrder(
        {
          items,
          screenNumber,
          seatNumber,
          showtime: new Date(showtime).toISOString(),
        },
        patronToken,
      );
      clearCart();
      onOrderPlaced();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setCheckoutError("One or more items are out of stock.");
      } else {
        setCheckoutError(error instanceof Error ? error.message : "Checkout failed");
      }
    } finally {
      setCheckingOut(false);
    }
  }

  return (
    <aside className="flex h-fit flex-col gap-4 rounded-lg border border-slate-700 bg-slate-800/50 p-4">
      <h2 className="text-lg font-semibold">Cart</h2>

      {items.length === 0 ? (
        <p className="text-sm text-slate-400">Your cart is empty.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((line) => (
            <li key={line.catalogItemId} className="flex items-center justify-between gap-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{line.name}</p>
                <p className="text-slate-400">{formatPrice(line.unitPriceCents)} each</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => updateQuantity(line.catalogItemId, line.quantity - 1)}
                  className="rounded border border-slate-600 px-2 py-0.5 hover:bg-slate-700"
                >
                  -
                </button>
                <span className="w-6 text-center">{line.quantity}</span>
                <button
                  type="button"
                  onClick={() => updateQuantity(line.catalogItemId, line.quantity + 1)}
                  className="rounded border border-slate-600 px-2 py-0.5 hover:bg-slate-700"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => removeItem(line.catalogItemId)}
                  className="ml-1 text-xs text-slate-500 hover:text-red-400"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2 border-t border-slate-700 pt-3 text-sm">
        <label className="block">
          <span className="text-slate-400">Screen</span>
          <input
            type="number"
            min={1}
            value={screenNumber}
            onChange={(e) => setScreenNumber(Number(e.target.value))}
            className="mt-1 w-full rounded border border-slate-600 bg-slate-900 px-2 py-1"
          />
        </label>
        <label className="block">
          <span className="text-slate-400">Seat</span>
          <input
            type="text"
            value={seatNumber}
            onChange={(e) => setSeatNumber(e.target.value)}
            className="mt-1 w-full rounded border border-slate-600 bg-slate-900 px-2 py-1"
          />
        </label>
        <label className="block">
          <span className="text-slate-400">Showtime</span>
          <input
            type="datetime-local"
            value={showtime}
            onChange={(e) => setShowtime(e.target.value)}
            className="mt-1 w-full rounded border border-slate-600 bg-slate-900 px-2 py-1"
          />
        </label>
      </div>

      <div className="flex items-center justify-between border-t border-slate-700 pt-3 font-semibold">
        <span>Total</span>
        <span>{formatPrice(totalCents)}</span>
      </div>

      {checkoutError && <ErrorBanner message={checkoutError} />}

      <button
        type="button"
        disabled={items.length === 0 || !patronToken || checkingOut}
        onClick={handleCheckout}
        className="rounded bg-emerald-600 py-2 font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {checkingOut ? "Placing order..." : "Checkout"}
      </button>
    </aside>
  );
}
