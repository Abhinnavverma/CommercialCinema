import type { ScenarioConfig } from "../types.js";

const DEFAULT_PROFILES: ScenarioConfig["audienceProfiles"] = [
  {
    name: "concession-heavy",
    weight: 0.35,
    ageGroup: "25-34",
    peaks: ["pre_show", "intermission"],
    basketRules: [
      { itemId: "popcorn-lg", p: 0.7, qty: [1, 2] },
      { itemId: "soda-lg", p: 0.6, qty: [1, 2] },
      { itemId: "nachos", p: 0.25, qty: [1, 1] },
    ],
  },
  {
    name: "intermission-rush",
    weight: 0.4,
    ageGroup: "18-24",
    peaks: ["intermission"],
    basketRules: [
      { itemId: "popcorn-lg", p: 0.85, qty: [1, 1] },
      { itemId: "soda-lg", p: 0.5, qty: [1, 1] },
    ],
  },
  {
    name: "light-snack",
    weight: 0.25,
    ageGroup: "35-44",
    peaks: ["pre_show"],
    basketRules: [
      { itemId: "water", p: 0.5, qty: [1, 2] },
      { itemId: "candy-mix", p: 0.4, qty: [1, 1] },
    ],
  },
];

function defaultShowtime(): string {
  const date = new Date();
  date.setHours(date.getHours() + 2, 15, 0, 0);
  return date.toISOString();
}

export const PRESET_IDS = {
  INTERMISSION_POPCORN_CRUSH: "intermission-popcorn-crush",
  OPENING_NIGHT: "opening-night",
  MATINEE_FAMILIES: "matinee-families",
} as const;

export type PresetId = (typeof PRESET_IDS)[keyof typeof PRESET_IDS];

export type SimulationPreset = {
  id: PresetId;
  label: string;
  description: string;
  config: ScenarioConfig;
};

export const SIMULATION_PRESETS: SimulationPreset[] = [
  {
    id: PRESET_IDS.INTERMISSION_POPCORN_CRUSH,
    label: "Intermission Popcorn Crush",
    description: "147 screens (~25k patrons) at 85% occupancy with only 50 large popcorns — tests sellout under intermission spike.",
    config: {
      mode: "live",
      venue: { screens: 147, seatsPerScreen: 200, occupancy: 0.85 },
      showtime: defaultShowtime(),
      intermissionAtMinutes: 55,
      windowMinutes: 30,
      runDurationSeconds: 25,
      workerConcurrency: 500,
      stockOverrides: { "popcorn-lg": 50 },
      audienceProfiles: DEFAULT_PROFILES,
    },
  },
  {
    id: PRESET_IDS.OPENING_NIGHT,
    label: "Opening Night",
    description: "Full venue, default stock, both pre-show and intermission peaks.",
    config: {
      mode: "live",
      venue: { screens: 16, seatsPerScreen: 250, occupancy: 0.9 },
      showtime: defaultShowtime(),
      intermissionAtMinutes: 60,
      windowMinutes: 35,
      runDurationSeconds: 120,
      audienceProfiles: DEFAULT_PROFILES,
    },
  },
  {
    id: PRESET_IDS.MATINEE_FAMILIES,
    label: "Matinee Families",
    description: "Lower occupancy with family-oriented baskets (small popcorn, candy).",
    config: {
      mode: "live",
      venue: { screens: 8, seatsPerScreen: 150, occupancy: 0.55 },
      showtime: defaultShowtime(),
      intermissionAtMinutes: 50,
      windowMinutes: 25,
      runDurationSeconds: 60,
      audienceProfiles: [
        {
          name: "families",
          weight: 0.6,
          ageGroup: "35-44",
          peaks: ["pre_show", "intermission"],
          basketRules: [
            { itemId: "popcorn-sm", p: 0.75, qty: [1, 3] },
            { itemId: "candy-mix", p: 0.6, qty: [1, 2] },
            { itemId: "soda-lg", p: 0.4, qty: [1, 2] },
          ],
        },
        {
          name: "kids",
          weight: 0.4,
          ageGroup: "13-17",
          peaks: ["intermission"],
          basketRules: [
            { itemId: "candy-mix", p: 0.8, qty: [1, 2] },
            { itemId: "soda-lg", p: 0.5, qty: [1, 1] },
          ],
        },
      ],
    },
  },
];
