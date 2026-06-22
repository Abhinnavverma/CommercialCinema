export type AnalyticsDashboardSummary = {
  totalOrders: number;
  totalRevenueCents: number;
};

export type AnalyticsByScreen = {
  screenNumber: number;
  orderCount: number;
  revenueCents: number;
};

export type AnalyticsByShowtime = {
  showtime: string;
  orderCount: number;
};

export type AnalyticsByAgeGroup = {
  ageGroup: string;
  orderCount: number;
};

export type AnalyticsTopItem = {
  catalogItemId: string;
  name: string;
  quantitySold: number;
  revenueCents: number;
};

export type AnalyticsRecentOrder = {
  orderId: string;
  screenNumber: number;
  showtime: string;
  ageGroup: string | null;
  itemCount: number;
  revenueCents: number;
  createdAt: string;
};

export type AnalyticsDashboard = {
  summary: AnalyticsDashboardSummary;
  byScreen: AnalyticsByScreen[];
  byShowtime: AnalyticsByShowtime[];
  byAgeGroup: AnalyticsByAgeGroup[];
  topItems: AnalyticsTopItem[];
  recentOrders: AnalyticsRecentOrder[];
};
