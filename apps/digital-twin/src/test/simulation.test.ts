import { describe, expect, test } from "bun:test";
import Redis from "ioredis";
import { PRESET_IDS, SIMULATION_PRESETS } from "../static/presets.js";
import { SIMULATION_MODE, STUB_REDIS_DB } from "../static/simulation.constants.js";
import { generateDemand, resolveInitialStock } from "../services/demand-generator.js";
import { auditOversell } from "../services/metrics-collector.js";
import { createStubOrderPipeline, createStubStock } from "../services/stub-order-pipeline.js";

describe("demand-generator", () => {
  test("generates patrons proportional to venue occupancy", () => {
    const preset = SIMULATION_PRESETS.find((item) => item.id === PRESET_IDS.OPENING_NIGHT)!;
    const patrons = generateDemand({ ...preset.config, mode: SIMULATION_MODE.STUB });
    const expected = Math.round(
      preset.config.venue.screens *
        preset.config.venue.seatsPerScreen *
        preset.config.venue.occupancy,
    );
    expect(patrons.length).toBe(expected);
    expect(patrons[0]!.items.length).toBeGreaterThan(0);
  });
});

describe("stub-order-pipeline", () => {
  test("intermission popcorn crush produces conflicts without oversell", async () => {
    const preset = SIMULATION_PRESETS.find((item) => item.id === PRESET_IDS.INTERMISSION_POPCORN_CRUSH)!;
    const config = {
      ...preset.config,
      mode: SIMULATION_MODE.STUB,
      venue: { screens: 4, seatsPerScreen: 50, occupancy: 0.5 },
      runDurationSeconds: 1,
    };

    const patrons = generateDemand(config).slice(0, 80);
    const initialStock = resolveInitialStock(config);

    const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
    const stubRedis = new Redis(redisUrl, { db: STUB_REDIS_DB, maxRetriesPerRequest: 3 });
    const stock = createStubStock(stubRedis);
    await stock.refill(initialStock);
    const pipeline = createStubOrderPipeline(stock);

    const outcomes = [];
    let conflicts = 0;

    for (const patron of patrons) {
      const outcome = await pipeline.placeOrder({
        patronId: patron.patronId,
        userId: patron.patronId,
        items: patron.items,
        screenNumber: patron.screenNumber,
        seatNumber: patron.seatNumber,
        showtime: config.showtime,
      });
      outcomes.push(outcome);
      if (outcome.statusCode === 409) {
        conflicts += 1;
      }
    }

    const finalStock = await stock.getLevels();
    const audit = auditOversell(initialStock, outcomes, finalStock);
    const popcornRemaining = finalStock["popcorn-lg"] ?? 0;
    const popcornSold = (initialStock["popcorn-lg"] ?? 0) - popcornRemaining;

    expect(popcornSold).toBeLessThanOrEqual(initialStock["popcorn-lg"] ?? 0);
    expect(audit.oversellEvents).toBe(0);
    expect(conflicts).toBeGreaterThan(0);
    expect(popcornRemaining).toBeGreaterThanOrEqual(0);

    stubRedis.disconnect();
  });
});
