import { EVENTS } from "@commerical-cinema/event-bus";
import type { OrderPlacedEvent } from "@commerical-cinema/event-bus";
import { analyticsEvents, type Db, type NewAnalyticsEvent } from "@commerical-cinema/schema";
import { sql } from "drizzle-orm";
import {
  DASHBOARD_RECENT_ORDERS_LIMIT,
  DASHBOARD_TOP_ITEMS_LIMIT,
} from "../static/index.js";
import type { AnalyticsDashboard } from "../types.js";

// Per-row revenue from JSONB line items — matches checkout total math.
const ORDER_REVENUE_SQL = sql.raw(`(
  SELECT COALESCE(SUM((item->>'quantity')::int * (item->>'unitPriceCents')::int), 0)
  FROM jsonb_array_elements(payload->'items') AS item
)`);

function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return Number(value);
  }
  return 0;
}

function toIsoString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    return value;
  }
  return new Date().toISOString();
}

export class AnalyticsService {
  constructor(private readonly db: Db) {}

  async bulkInsert(events: OrderPlacedEvent[]): Promise<void> {
    if (events.length === 0) {
      return;
    }

    const batchedAt = new Date();
    const rows: NewAnalyticsEvent[] = events.map((event) => ({
      eventType: EVENTS.ORDER_PLACED,
      userId: event.userId,
      screenNumber: event.screenNumber,
      showtime: new Date(event.showtime),
      ageGroup: event.ageGroup ?? null,
      payload: {
        orderId: event.orderId,
        seatNumber: event.seatNumber,
        items: event.items,
      },
      batchedAt,
    }));

    await this.db.insert(analyticsEvents).values(rows);
  }

  async getDashboard(): Promise<AnalyticsDashboard> {
    const [summaryRows, byScreenRows, byShowtimeRows, byAgeGroupRows, topItemRows, recentRows] =
      await Promise.all([
        this.db.execute(sql`
          SELECT
            COUNT(*)::int AS total_orders,
            COALESCE(SUM(${ORDER_REVENUE_SQL}), 0)::int AS total_revenue_cents
          FROM analytics_events
          WHERE event_type = ${EVENTS.ORDER_PLACED}
        `),
        this.db.execute(sql`
          SELECT
            screen_number,
            COUNT(*)::int AS order_count,
            COALESCE(SUM(${ORDER_REVENUE_SQL}), 0)::int AS revenue_cents
          FROM analytics_events
          WHERE event_type = ${EVENTS.ORDER_PLACED}
            AND screen_number IS NOT NULL
          GROUP BY screen_number
          ORDER BY screen_number ASC
        `),
        this.db.execute(sql`
          SELECT
            showtime,
            COUNT(*)::int AS order_count
          FROM analytics_events
          WHERE event_type = ${EVENTS.ORDER_PLACED}
            AND showtime IS NOT NULL
          GROUP BY showtime
          ORDER BY showtime DESC
        `),
        this.db.execute(sql`
          SELECT
            age_group,
            COUNT(*)::int AS order_count
          FROM analytics_events
          WHERE event_type = ${EVENTS.ORDER_PLACED}
            AND age_group IS NOT NULL
          GROUP BY age_group
          ORDER BY order_count DESC
        `),
        this.db.execute(sql`
          SELECT
            item->>'catalogItemId' AS catalog_item_id,
            item->>'name' AS name,
            SUM((item->>'quantity')::int)::int AS quantity_sold,
            SUM((item->>'quantity')::int * (item->>'unitPriceCents')::int)::int AS revenue_cents
          FROM analytics_events,
            jsonb_array_elements(payload->'items') AS item
          WHERE event_type = ${EVENTS.ORDER_PLACED}
          GROUP BY catalog_item_id, name
          ORDER BY quantity_sold DESC
          LIMIT ${DASHBOARD_TOP_ITEMS_LIMIT}
        `),
        this.db.execute(sql`
          SELECT
            payload->>'orderId' AS order_id,
            screen_number,
            showtime,
            age_group,
            jsonb_array_length(payload->'items')::int AS item_count,
            ${ORDER_REVENUE_SQL}::int AS revenue_cents,
            created_at
          FROM analytics_events
          WHERE event_type = ${EVENTS.ORDER_PLACED}
          ORDER BY created_at DESC
          LIMIT ${DASHBOARD_RECENT_ORDERS_LIMIT}
        `),
      ]);

    const summaryRow = summaryRows[0] as Record<string, unknown> | undefined;

    return {
      summary: {
        totalOrders: toNumber(summaryRow?.total_orders),
        totalRevenueCents: toNumber(summaryRow?.total_revenue_cents),
      },
      byScreen: (byScreenRows as Record<string, unknown>[]).map((row) => ({
        screenNumber: toNumber(row.screen_number),
        orderCount: toNumber(row.order_count),
        revenueCents: toNumber(row.revenue_cents),
      })),
      byShowtime: (byShowtimeRows as Record<string, unknown>[]).map((row) => ({
        showtime: toIsoString(row.showtime),
        orderCount: toNumber(row.order_count),
      })),
      byAgeGroup: (byAgeGroupRows as Record<string, unknown>[]).map((row) => ({
        ageGroup: String(row.age_group ?? ""),
        orderCount: toNumber(row.order_count),
      })),
      topItems: (topItemRows as Record<string, unknown>[]).map((row) => ({
        catalogItemId: String(row.catalog_item_id ?? ""),
        name: String(row.name ?? ""),
        quantitySold: toNumber(row.quantity_sold),
        revenueCents: toNumber(row.revenue_cents),
      })),
      recentOrders: (recentRows as Record<string, unknown>[]).map((row) => ({
        orderId: String(row.order_id ?? ""),
        screenNumber: toNumber(row.screen_number),
        showtime: toIsoString(row.showtime),
        ageGroup: row.age_group === null || row.age_group === undefined ? null : String(row.age_group),
        itemCount: toNumber(row.item_count),
        revenueCents: toNumber(row.revenue_cents),
        createdAt: toIsoString(row.created_at),
      })),
    };
  }
}
