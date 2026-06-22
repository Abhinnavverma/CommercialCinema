import { describe, expect, test } from "bun:test";
import type { FastifyReply, FastifyRequest } from "fastify";
import { HTTP_STATUS } from "@commerical-cinema/core";
import { createAnalyticsController } from "./analytics-controller.js";
import type { AnalyticsDashboard } from "../types.js";

const mockDashboard: AnalyticsDashboard = {
  summary: { totalOrders: 3, totalRevenueCents: 4500 },
  byScreen: [{ screenNumber: 5, orderCount: 2, revenueCents: 3000 }],
  byShowtime: [{ showtime: "2026-07-01T20:15:00.000Z", orderCount: 3 }],
  byAgeGroup: [{ ageGroup: "25-34", orderCount: 2 }],
  topItems: [
    {
      catalogItemId: "popcorn-lg",
      name: "Large Popcorn",
      quantitySold: 4,
      revenueCents: 3596,
    },
  ],
  recentOrders: [
    {
      orderId: "order-1",
      screenNumber: 5,
      showtime: "2026-07-01T20:15:00.000Z",
      ageGroup: "25-34",
      itemCount: 2,
      revenueCents: 1500,
      createdAt: "2026-07-01T20:20:00.000Z",
    },
  ],
};

type CapturedReply = {
  statusCode?: number;
  payload?: unknown;
};

function fakeReply(captured: CapturedReply): FastifyReply {
  const reply = {
    status(code: number) {
      captured.statusCode = code;
      return reply;
    },
    send(payload?: unknown) {
      captured.payload = payload;
      return reply;
    },
  };
  return reply as unknown as FastifyReply;
}

describe("AnalyticsController.getDashboard", () => {
  test("returns dashboard aggregates on success", async () => {
    const controller = createAnalyticsController({
      analyticsService: {
        getDashboard: async () => mockDashboard,
      },
      log: () => {},
    });

    const captured: CapturedReply = {};
    const result = await controller.getDashboard({} as FastifyRequest, fakeReply(captured));

    expect(result).toEqual(mockDashboard);
    expect(captured.statusCode).toBeUndefined();
  });

  test("returns 500 when the service throws", async () => {
    const controller = createAnalyticsController({
      analyticsService: {
        getDashboard: async () => {
          throw new Error("db down");
        },
      },
      log: () => {},
    });

    const captured: CapturedReply = {};
    await controller.getDashboard({} as FastifyRequest, fakeReply(captured));

    expect(captured.statusCode).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    expect(captured.payload).toEqual({ error: "Failed to load analytics dashboard" });
  });
});
