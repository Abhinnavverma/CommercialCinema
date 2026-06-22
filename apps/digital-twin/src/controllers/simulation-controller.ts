import type { FastifyReply, FastifyRequest } from "fastify";
import { HTTP_STATUS } from "@commerical-cinema/core";
import { SIMULATION_PRESETS } from "../static/presets.js";
import { RUN_STATUS, SIMULATION_MODE } from "../static/simulation.constants.js";
import type { ScenarioConfig, SimulationRun } from "../types.js";
import type { SimulationRunner } from "../services/traffic-driver.js";

const ERROR_MESSAGES = {
  INVALID_SCENARIO: "Invalid scenario configuration",
  RUN_NOT_FOUND: "Simulation run not found",
  ADMIN_TOKEN_REQUIRED: "Authorization bearer token required",
  RUN_NOT_COMPLETE: "Simulation run has not completed",
} as const;

function extractBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return null;
  }
  return header.slice("Bearer ".length);
}

function isAudienceProfile(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  const profile = value as Record<string, unknown>;
  return (
    typeof profile.name === "string" &&
    typeof profile.weight === "number" &&
    profile.weight > 0 &&
    typeof profile.ageGroup === "string" &&
    Array.isArray(profile.peaks) &&
    profile.peaks.length > 0 &&
    Array.isArray(profile.basketRules)
  );
}

function parseScenario(body: unknown): ScenarioConfig | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const raw = body as Record<string, unknown>;
  const venue = raw.venue as Record<string, unknown> | undefined;

  if (
    !venue ||
    typeof venue.screens !== "number" ||
    venue.screens <= 0 ||
    typeof venue.seatsPerScreen !== "number" ||
    venue.seatsPerScreen <= 0 ||
    typeof venue.occupancy !== "number" ||
    venue.occupancy <= 0 ||
    venue.occupancy > 1
  ) {
    return null;
  }

  if (typeof raw.showtime !== "string" || Number.isNaN(new Date(raw.showtime).getTime())) {
    return null;
  }

  if (typeof raw.windowMinutes !== "number" || raw.windowMinutes <= 0) {
    return null;
  }

  if (raw.mode !== SIMULATION_MODE.LIVE && raw.mode !== SIMULATION_MODE.STUB) {
    return null;
  }

  if (!Array.isArray(raw.audienceProfiles) || !raw.audienceProfiles.every(isAudienceProfile)) {
    return null;
  }

  const stockOverrides =
    raw.stockOverrides && typeof raw.stockOverrides === "object"
      ? (raw.stockOverrides as Record<string, number>)
      : undefined;

  return {
    mode: raw.mode,
    venue: {
      screens: venue.screens,
      seatsPerScreen: venue.seatsPerScreen,
      occupancy: venue.occupancy,
    },
    showtime: raw.showtime,
    intermissionAtMinutes:
      typeof raw.intermissionAtMinutes === "number" ? raw.intermissionAtMinutes : undefined,
    windowMinutes: raw.windowMinutes,
    runDurationSeconds:
      typeof raw.runDurationSeconds === "number" ? raw.runDurationSeconds : undefined,
    stockOverrides,
    audienceProfiles: raw.audienceProfiles as ScenarioConfig["audienceProfiles"],
    workerConcurrency:
      typeof raw.workerConcurrency === "number" ? raw.workerConcurrency : undefined,
  };
}

function serializeRun(run: SimulationRun) {
  return {
    runId: run.runId,
    config: run.config,
    status: run.status,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    error: run.error,
    totalPatrons: run.totalPatrons,
    completedOrders: run.completedOrders,
    failedOrders: run.failedOrders,
    liveMetrics: run.liveMetrics,
    timeSeries: run.timeSeries,
    report: run.report,
  };
}

export function createSimulationController(runner: SimulationRunner) {
  return {
    listPresets() {
      return { presets: SIMULATION_PRESETS };
    },

    startRun(request: FastifyRequest, reply: FastifyReply) {
      const config = parseScenario(request.body);
      if (!config) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({ error: ERROR_MESSAGES.INVALID_SCENARIO });
      }

      const adminToken = extractBearerToken(request);
      if (config.mode === SIMULATION_MODE.LIVE && !adminToken) {
        return reply
          .status(HTTP_STATUS.UNAUTHORIZED)
          .send({ error: ERROR_MESSAGES.ADMIN_TOKEN_REQUIRED });
      }

      const run = runner.startRun(config, adminToken);
      return reply.status(HTTP_STATUS.OK).send({ runId: run.runId, status: run.status });
    },

    getRun(request: FastifyRequest, reply: FastifyReply) {
      const { runId } = request.params as { runId: string };
      const run = runner.getRun(runId);
      if (!run) {
        return reply.status(HTTP_STATUS.NOT_FOUND).send({ error: ERROR_MESSAGES.RUN_NOT_FOUND });
      }
      return serializeRun(run);
    },

    getReport(request: FastifyRequest, reply: FastifyReply) {
      const { runId } = request.params as { runId: string };
      const run = runner.getRun(runId);
      if (!run) {
        return reply.status(HTTP_STATUS.NOT_FOUND).send({ error: ERROR_MESSAGES.RUN_NOT_FOUND });
      }
      if (run.status !== RUN_STATUS.COMPLETED && run.status !== RUN_STATUS.CANCELLED) {
        return reply.status(HTTP_STATUS.CONFLICT).send({ error: ERROR_MESSAGES.RUN_NOT_COMPLETE });
      }
      if (!run.report) {
        return reply.status(HTTP_STATUS.CONFLICT).send({ error: ERROR_MESSAGES.RUN_NOT_COMPLETE });
      }
      return { report: run.report, timeSeries: run.timeSeries };
    },

    cancelRun(request: FastifyRequest, reply: FastifyReply) {
      const { runId } = request.params as { runId: string };
      const run = runner.cancelRun(runId);
      if (!run) {
        return reply.status(HTTP_STATUS.NOT_FOUND).send({ error: ERROR_MESSAGES.RUN_NOT_FOUND });
      }
      return { runId: run.runId, status: run.status };
    },
  };
}

export type SimulationController = ReturnType<typeof createSimulationController>;
