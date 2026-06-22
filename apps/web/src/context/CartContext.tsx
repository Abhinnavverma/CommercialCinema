import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { CartItem } from "@commerical-cinema/schema";

type CartContextValue = {
  items: CartItem[];
  totalCents: number;
  addItem: (item: Omit<CartItem, "quantity">) => void;
  removeItem: (catalogItemId: string) => void;
  updateQuantity: (catalogItemId: string, quantity: number) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = useCallback((item: Omit<CartItem, "quantity">) => {
    setItems((prev) => {
      const existing = prev.find((line) => line.catalogItemId === item.catalogItemId);
      if (existing) {
        return prev.map((line) =>
          line.catalogItemId === item.catalogItemId
            ? { ...line, quantity: line.quantity + 1 }
            : line,
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  }, []);

  const removeItem = useCallback((catalogItemId: string) => {
    setItems((prev) => prev.filter((line) => line.catalogItemId !== catalogItemId));
  }, []);

  const updateQuantity = useCallback((catalogItemId: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((line) => line.catalogItemId !== catalogItemId));
      return;
    }
    setItems((prev) =>
      prev.map((line) => (line.catalogItemId === catalogItemId ? { ...line, quantity } : line)),
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const totalCents = useMemo(
    () => items.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0),
    [items],
  );

  const value = useMemo(
    () => ({
      items,
      totalCents,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
    }),
    [items, totalCents, addItem, removeItem, updateQuantity, clearCart],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within CartProvider");
  }
  return context;
}
