import { describe, expect, test, mock } from "bun:test";
import { EVENTS } from "@commerical-cinema/event-bus";
import type { OrderPlacedEvent } from "@commerical-cinema/event-bus";
import { createAnalyticsBatcher } from "./analytics-batcher.js";

function mockOrderPlaced(orderId: string): OrderPlacedEvent {
  return {
    orderId,
    userId: "user-abc",
    screenNumber: 5,
    seatNumber: "A12",
    showtime: "2026-07-01T20:15:00.000Z",
    ageGroup: "25-34",
    items: [
      {
        catalogItemId: "popcorn-lg",
        quantity: 2,
        unitPriceCents: 899,
        name: "Large Popcorn",
      },
    ],
  };
}

describe("AnalyticsBatcher", () => {
  test("flushes 5 buffered OrderPlaced events as a single bulkInsert call", async () => {
    const bulkInsert = mock(async (_events: OrderPlacedEvent[]) => {});

    const batcher = createAnalyticsBatcher({
      analyticsService: { bulkInsert },
      batchMaxSize: 5,
    });

    for (let index = 0; index < 5; index += 1) {
      batcher.enqueue(mockOrderPlaced(`order-${index}`));
    }

    expect(bulkInsert).toHaveBeenCalledTimes(1);
    expect(bulkInsert.mock.calls[0]?.[0]).toHaveLength(5);
    expect(bulkInsert.mock.calls[0]?.[0]?.map((event) => event.orderId)).toEqual([
      "order-0",
      "order-1",
      "order-2",
      "order-3",
      "order-4",
    ]);
  });

  test("manual flush drains fewer than batchMaxSize events into one bulkInsert", async () => {
    const bulkInsert = mock(async (_events: OrderPlacedEvent[]) => {});

    const batcher = createAnalyticsBatcher({
      analyticsService: { bulkInsert },
      batchMaxSize: 1000,
    });

    batcher.enqueue(mockOrderPlaced("order-a"));
    batcher.enqueue(mockOrderPlaced("order-b"));
    batcher.enqueue(mockOrderPlaced("order-c"));

    expect(bulkInsert).toHaveBeenCalledTimes(0);

    await batcher.flush();

    expect(bulkInsert).toHaveBeenCalledTimes(1);
    expect(bulkInsert.mock.calls[0]?.[0]).toHaveLength(3);
  });
});

describe("AnalyticsService mapping", () => {
  test("bulkInsert maps OrderPlacedEvent rows for analytics_events", async () => {
    const insertedValues: unknown[] = [];
    const fakeDb = {
      insert: () => ({
        values: (rows: unknown[]) => {
          insertedValues.push(...rows);
          return Promise.resolve();
        },
      }),
    };

    const { AnalyticsService } = await import("../services/analytics-service.js");
    const service = new AnalyticsService(fakeDb as never);
    const event = mockOrderPlaced("order-map-1");

    await service.bulkInsert([event]);

    expect(insertedValues).toHaveLength(1);
    expect(insertedValues[0]).toMatchObject({
      eventType: EVENTS.ORDER_PLACED,
      userId: event.userId,
      screenNumber: event.screenNumber,
      ageGroup: event.ageGroup,
      payload: {
        orderId: event.orderId,
        seatNumber: event.seatNumber,
        items: event.items,
      },
    });
  });
});
