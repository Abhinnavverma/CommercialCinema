import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { createDb } from "@commerical-cinema/schema";
import { AnalyticsService } from "../services/analytics-service.js";
import { DEFAULT_DATABASE_URL } from "../static/index.js";

const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;

async function probePostgres(): Promise<boolean> {
  try {
    const db = createDb(databaseUrl);
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

const reachable = await probePostgres();

describe.skipIf(!reachable)("AnalyticsService.getDashboard (real Postgres)", () => {
  test("returns a valid dashboard shape", async () => {
    const service = new AnalyticsService(createDb(databaseUrl));
    const dashboard = await service.getDashboard();

    expect(dashboard.summary.totalOrders).toBeGreaterThanOrEqual(0);
    expect(dashboard.summary.totalRevenueCents).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(dashboard.byScreen)).toBe(true);
    expect(Array.isArray(dashboard.byShowtime)).toBe(true);
    expect(Array.isArray(dashboard.byAgeGroup)).toBe(true);
    expect(Array.isArray(dashboard.topItems)).toBe(true);
    expect(Array.isArray(dashboard.recentOrders)).toBe(true);
  });
});
