import type { CartItem, Order, OrderItem } from "@commerical-cinema/schema";
import { apiRequest } from "./client.js";

export type PlaceOrderBody = {
  items: CartItem[];
  screenNumber: number;
  seatNumber: string;
  showtime: string;
};

export type PlaceOrderResponse = {
  orderId: string;
  status: string;
  totalCents: number;
};

export type OrderWithItems = {
  order: Order;
  items: OrderItem[];
};

export function placeOrder(body: PlaceOrderBody, token: string): Promise<PlaceOrderResponse> {
  return apiRequest<PlaceOrderResponse>("/orders", {
    method: "POST",
    body,
    token,
  });
}

export function fetchPatronOrders(token: string): Promise<{ orders: Order[] }> {
  return apiRequest<{ orders: Order[] }>("/orders", { token });
}

export function cancelPatronOrder(
  orderId: string,
  token: string,
): Promise<{ orderId: string; status: string }> {
  return apiRequest<{ orderId: string; status: string }>("/orders/cancel", {
    method: "DELETE",
    body: { orderId },
    token,
  });
}

export function fetchAdminOrders(token: string): Promise<{ orders: Order[] }> {
  return apiRequest<{ orders: Order[] }>("/admin/orders", { token });
}

export function fetchAdminOrder(orderId: string, token: string): Promise<OrderWithItems> {
  return apiRequest<OrderWithItems>(`/admin/orders/${orderId}`, { token });
}

export function updateOrderStatus(
  orderId: string,
  status: string,
  token: string,
): Promise<{ orderId: string; status: string }> {
  return apiRequest<{ orderId: string; status: string }>(`/orders/${orderId}/status`, {
    method: "PUT",
    body: { status },
    token,
  });
}
