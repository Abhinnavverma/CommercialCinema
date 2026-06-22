import { randomUUID } from "node:crypto";
import { SEED_PRODUCTS } from "@commerical-cinema/schema";
import type { CartItem } from "@commerical-cinema/schema";
import {
  INTERMISSION_SIGMA_MINUTES,
  PRE_SHOW_OFFSET_MINUTES,
  PRE_SHOW_SIGMA_MINUTES,
  WINDOW_AFTER_INTERMISSION_MINUTES,
  WINDOW_BEFORE_SHOW_MINUTES,
} from "../static/simulation.constants.js";
import type { AudienceProfile, ScenarioConfig, VirtualPatron } from "../types.js";

const PRODUCT_BY_ID = new Map(SEED_PRODUCTS.map((product) => [product.id, product]));

function gaussianRandom(): number {
  let u = 0;
  let v = 0;
  while (u === 0) {
    u = Math.random();
  }
  while (v === 0) {
    v = Math.random();
  }
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function sampleGaussianMs(centerMs: number, sigmaMinutes: number): number {
  return centerMs + gaussianRandom() * sigmaMinutes * 60 * 1000;
}

function pickProfile(profiles: AudienceProfile[]): AudienceProfile {
  const totalWeight = profiles.reduce((sum, profile) => sum + profile.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const profile of profiles) {
    roll -= profile.weight;
    if (roll <= 0) {
      return profile;
    }
  }
  return profiles[profiles.length - 1]!;
}

function pickPeak(profile: AudienceProfile): "pre_show" | "intermission" {
  if (profile.peaks.length === 1) {
    return profile.peaks[0]!;
  }
  return profile.peaks[Math.floor(Math.random() * profile.peaks.length)]!;
}

function buildBasket(profile: AudienceProfile): CartItem[] {
  const items: CartItem[] = [];

  for (const rule of profile.basketRules) {
    if (Math.random() > rule.p) {
      continue;
    }

    const product = PRODUCT_BY_ID.get(rule.itemId);
    if (!product) {
      continue;
    }

    const [minQty, maxQty] = rule.qty;
    const quantity = minQty + Math.floor(Math.random() * (maxQty - minQty + 1));

    items.push({
      catalogItemId: product.id,
      quantity,
      unitPriceCents: product.priceCents,
      name: product.name,
    });
  }

  if (items.length === 0) {
    const fallback = PRODUCT_BY_ID.get("water");
    if (fallback) {
      items.push({
        catalogItemId: fallback.id,
        quantity: 1,
        unitPriceCents: fallback.priceCents,
        name: fallback.name,
      });
    }
  }

  return items;
}

function seatLabel(screenIndex: number, seatIndex: number): string {
  const row = String.fromCharCode(65 + (seatIndex % 10));
  const seat = (seatIndex % 20) + 1;
  return `S${screenIndex}-${row}${seat}`;
}

export type DemandWindow = {
  windowStartMs: number;
  windowEndMs: number;
  showtimeMs: number;
};

export function computeDemandWindow(config: ScenarioConfig): DemandWindow {
  const showtimeMs = new Date(config.showtime).getTime();
  const intermissionMinutes = config.intermissionAtMinutes ?? 60;
  const intermissionCenterMs = showtimeMs + intermissionMinutes * 60 * 1000;

  const windowStartMs = showtimeMs - WINDOW_BEFORE_SHOW_MINUTES * 60 * 1000;
  const windowEndMs = intermissionCenterMs + WINDOW_AFTER_INTERMISSION_MINUTES * 60 * 1000;

  return { windowStartMs, windowEndMs, showtimeMs };
}

export function generateDemand(config: ScenarioConfig): VirtualPatron[] {
  const { screens, seatsPerScreen, occupancy } = config.venue;
  const patronCount = Math.max(1, Math.round(screens * seatsPerScreen * occupancy));

  const { windowStartMs, windowEndMs, showtimeMs } = computeDemandWindow(config);
  const intermissionMinutes = config.intermissionAtMinutes ?? 60;

  const preShowCenterMs = showtimeMs - PRE_SHOW_OFFSET_MINUTES * 60 * 1000;
  const intermissionCenterMs = showtimeMs + intermissionMinutes * 60 * 1000;

  const patrons: VirtualPatron[] = [];

  for (let index = 0; index < patronCount; index += 1) {
    const profile = pickProfile(config.audienceProfiles);
    const peak = pickPeak(profile);
    const scheduledAtMs =
      peak === "pre_show"
        ? sampleGaussianMs(preShowCenterMs, PRE_SHOW_SIGMA_MINUTES)
        : sampleGaussianMs(intermissionCenterMs, INTERMISSION_SIGMA_MINUTES);

    const clampedMs = Math.min(windowEndMs, Math.max(windowStartMs, scheduledAtMs));
    const screenNumber = (index % screens) + 1;
    const seatNumber = seatLabel(screenNumber, index);

    patrons.push({
      patronId: randomUUID(),
      sessionId: `twin-${randomUUID()}`,
      screenNumber,
      seatNumber,
      ageGroup: profile.ageGroup,
      profileName: profile.name,
      scheduledAtMs: clampedMs,
      items: buildBasket(profile),
    });
  }

  patrons.sort((a, b) => a.scheduledAtMs - b.scheduledAtMs);
  return patrons;
}

export function resolveInitialStock(config: ScenarioConfig): Record<string, number> {
  const stock: Record<string, number> = {};
  for (const product of SEED_PRODUCTS) {
    stock[product.id] = config.stockOverrides?.[product.id] ?? product.initialStock;
  }
  return stock;
}

export function mapToWallTime(
  scheduledAtMs: number,
  windowStartMs: number,
  windowEndMs: number,
  runStartMs: number,
  runDurationMs: number,
): number {
  const span = windowEndMs - windowStartMs;
  if (span <= 0) {
    return runStartMs;
  }
  const fraction = (scheduledAtMs - windowStartMs) / span;
  return runStartMs + fraction * runDurationMs;
}
