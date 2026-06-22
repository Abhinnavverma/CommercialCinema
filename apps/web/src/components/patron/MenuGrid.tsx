import { useEffect, useState } from "react";
import { fetchMenu } from "../../api/menu.js";
import type { MenuItem } from "../../types/index.js";
import { ErrorBanner } from "../shared/ErrorBanner.js";
import { MenuItemCard } from "./MenuItemCard.js";

export function MenuGrid() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMenu()
      .then((response) => setItems(response.items))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-slate-400">Loading menu...</p>;
  }

  if (error) {
    return <ErrorBanner message={error} />;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <MenuItemCard key={item.id} item={item} />
      ))}
    </div>
  );
}
