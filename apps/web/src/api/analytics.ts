import { apiRequest } from "./client.js";

export type AnalyticsDashboard = {
  summary: {
    totalOrders: number;
    totalRevenueCents: number;
  };
  byScreen: {
    screenNumber: number;
    orderCount: number;
    revenueCents: number;
  }[];
  byShowtime: {
    showtime: string;
    orderCount: number;
  }[];
  byAgeGroup: {
    ageGroup: string;
    orderCount: number;
  }[];
  topItems: {
    catalogItemId: string;
    name: string;
    quantitySold: number;
    revenueCents: number;
  }[];
  recentOrders: {
    orderId: string;
    screenNumber: number;
    showtime: string;
    ageGroup: string | null;
    itemCount: number;
    revenueCents: number;
    createdAt: string;
  }[];
};

export function fetchAnalyticsDashboard(token: string): Promise<AnalyticsDashboard> {
  return apiRequest<AnalyticsDashboard>("/admin/analytics/dashboard", { token });
}
