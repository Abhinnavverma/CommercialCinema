import type { OrderItem } from "@commerical-cinema/schema";
import { apiRequest } from "./client.js";

export type StockLevel = {
  itemId: string;
  name: string;
  available: number;
};

export function refillStock(token: string): Promise<{ refilled: number }> {
  return apiRequest<{ refilled: number }>("/stock/refill", {
    method: "POST",
    token,
  });
}

export function fetchAdminStock(token: string): Promise<{ items: StockLevel[] }> {
  return apiRequest<{ items: StockLevel[] }>("/admin/stock", { token });
}

export function setStockLevel(
  itemId: string,
  quantity: number,
  token: string,
): Promise<{ itemId: string; available: number }> {
  return apiRequest<{ itemId: string; available: number }>(`/admin/stock/${itemId}`, {
    method: "PUT",
    body: { quantity },
    token,
  });
}
