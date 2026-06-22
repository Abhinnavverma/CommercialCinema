import { EVENTS } from "@commerical-cinema/event-bus";
import type { OrderPlacedEvent } from "@commerical-cinema/event-bus";
import { analyticsEvents, type Db, type NewAnalyticsEvent } from "@commerical-cinema/schema";

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
}
