import { pgTable, uuid, varchar, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { users } from "./users";

export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    userId: uuid("user_id").references(() => users.id),
    screenNumber: integer("screen_number"),
    showtime: timestamp("showtime", { withTimezone: true }),
    ageGroup: varchar("age_group", { length: 32 }),
    payload: jsonb("payload").notNull(),
    batchedAt: timestamp("batched_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("analytics_events_created_at_idx").on(table.createdAt),
    index("analytics_events_screen_showtime_idx").on(table.screenNumber, table.showtime),
    index("analytics_events_unbatched_idx").on(table.batchedAt),
  ],
);

export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type NewAnalyticsEvent = typeof analyticsEvents.$inferInsert;
