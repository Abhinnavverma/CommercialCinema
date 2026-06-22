import type { MenuItem } from "../../types/index.js";
import { useCinemaSocketContext } from "../../context/CinemaSocketContext.js";
import { useCart } from "../../context/CartContext.js";

type MenuItemCardProps = {
  item: MenuItem;
};

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function MenuItemCard({ item }: MenuItemCardProps) {
  const { zeroStockIds } = useCinemaSocketContext();
  const { addItem, items } = useCart();

  const cartQty = items.find((line) => line.catalogItemId === item.id)?.quantity ?? 0;
  const soldOut = !item.inStock || zeroStockIds.has(item.id) || item.available === 0;
  const disabled = soldOut || cartQty >= item.available;

  return (
    <article
      data-testid={`menu-item-${item.id}`}
      className={`flex flex-col rounded-lg border border-slate-700 bg-slate-800/50 p-4${soldOut ? " opacity-75" : ""}`}
    >
      <h3 className="font-semibold">{item.name}</h3>
      {item.description && <p className="mt-1 flex-1 text-sm text-slate-400">{item.description}</p>}
      <div className="mt-3 flex items-center justify-between">
        <div className="text-sm">
          <span className="font-medium text-emerald-400">{formatPrice(item.priceCents)}</span>
          {soldOut ? (
            <span className="ml-2 font-medium text-red-400" data-testid={`sold-out-${item.id}`}>
              Sold out
            </span>
          ) : (
            <span className="ml-2 text-slate-500">{item.available} left</span>
          )}
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            addItem({
              catalogItemId: item.id,
              name: item.name,
              unitPriceCents: item.priceCents,
            })
          }
          className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {soldOut ? "Sold out" : "Add to Cart"}
        </button>
      </div>
    </article>
  );
}
