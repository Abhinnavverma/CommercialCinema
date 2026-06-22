import { useCallback, useEffect, useMemo, useState } from "react";
import {
  cancelSimulation,
  fetchSimulationPresets,
  fetchSimulationReport,
  fetchSimulationRun,
  startSimulation,
  type ScenarioConfig,
  type SimulationPreset,
  type SimulationReport,
  type SimulationRun,
} from "../../api/simulation.js";
import { useAuth } from "../../context/AuthContext.js";
import { ErrorBanner } from "../shared/ErrorBanner.js";

function formatMs(value: number): string {
  return `${Math.round(value)}ms`;
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length === 0) {
    return <span className="text-slate-500">—</span>;
  }

  const max = Math.max(...values, 1);
  return (
    <div className="flex h-8 items-end gap-0.5">
      {values.slice(-24).map((value, index) => (
        <div
          key={`${index}-${value}`}
          className="w-1.5 rounded-sm bg-cyan-500/80"
          style={{ height: `${Math.max(8, (value / max) * 100)}%` }}
          title={`${value.toFixed(2)} orders/s`}
        />
      ))}
    </div>
  );
}

export function SimulationPanel() {
  const { adminToken } = useAuth();
  const [presets, setPresets] = useState<SimulationPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [config, setConfig] = useState<ScenarioConfig | null>(null);
  const [run, setRun] = useState<SimulationRun | null>(null);
  const [report, setReport] = useState<SimulationReport | null>(null);
  const [loadingPresets, setLoadingPresets] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPresets = useCallback(async () => {
    if (!adminToken) {
      return;
    }

    setLoadingPresets(true);
    setError(null);

    try {
      const response = await fetchSimulationPresets(adminToken);
      setPresets(response.presets);
      if (response.presets.length > 0) {
        setSelectedPresetId(response.presets[0]!.id);
        setConfig({ ...response.presets[0]!.config });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load simulation presets");
    } finally {
      setLoadingPresets(false);
    }
  }, [adminToken]);

  useEffect(() => {
    void loadPresets();
  }, [loadPresets]);

  useEffect(() => {
    const preset = presets.find((item) => item.id === selectedPresetId);
    if (preset) {
      setConfig({ ...preset.config });
    }
  }, [selectedPresetId, presets]);

  useEffect(() => {
    if (!adminToken || !run || run.status !== "running") {
      return;
    }

    const timer = setInterval(async () => {
      try {
        const latest = await fetchSimulationRun(run.runId, adminToken);
        setRun(latest);
        if (latest.status === "completed" || latest.status === "cancelled" || latest.status === "failed") {
          setRunning(false);
          if (latest.report) {
            setReport(latest.report);
          } else if (latest.status !== "failed") {
            const reportResponse = await fetchSimulationReport(run.runId, adminToken);
            setReport(reportResponse.report);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to poll simulation run");
        setRunning(false);
      }
    }, 2000);

    return () => clearInterval(timer);
  }, [adminToken, run]);

  const throughputSeries = useMemo(
    () => run?.timeSeries.map((bucket) => bucket.ordersPerSecond) ?? [],
    [run?.timeSeries],
  );

  const hotStock = useMemo(() => {
    if (!run?.liveMetrics.redisStock) {
      return [];
    }
    return Object.entries(run.liveMetrics.redisStock)
      .sort(([, a], [, b]) => a - b)
      .slice(0, 5);
  }, [run?.liveMetrics.redisStock]);

  async function handleRun() {
    if (!adminToken || !config) {
      return;
    }

    setRunning(true);
    setError(null);
    setReport(null);
    setRun(null);

    try {
      const started = await startSimulation(config, adminToken);
      const initial = await fetchSimulationRun(started.runId, adminToken);
      setRun(initial);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start simulation");
      setRunning(false);
    }
  }

  async function handleCancel() {
    if (!adminToken || !run) {
      return;
    }

    try {
      await cancelSimulation(run.runId, adminToken);
      const latest = await fetchSimulationRun(run.runId, adminToken);
      setRun(latest);
      setRunning(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel simulation");
    }
  }

  function downloadReport() {
    if (!report) {
      return;
    }
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `simulation-${report.runId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (loadingPresets || !config) {
    return <p className="text-slate-400">Loading simulation presets...</p>;
  }

  return (
    <section className="space-y-6 rounded-lg border border-slate-800 bg-slate-900/50 p-6">
      <div>
        <h2 className="text-xl font-semibold text-white">Digital Twin Simulator</h2>
        <p className="mt-1 text-sm text-slate-400">
          Model cinema demand curves and stress-test checkout under pre-show and intermission spikes.
        </p>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-slate-300">Preset</span>
          <select
            className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            value={selectedPresetId}
            onChange={(event) => setSelectedPresetId(event.target.value)}
            disabled={running}
          >
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-slate-300">Mode</span>
          <select
            className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            value={config.mode}
            onChange={(event) =>
              setConfig((prev) =>
                prev ? { ...prev, mode: event.target.value as ScenarioConfig["mode"] } : prev,
              )
            }
            disabled={running}
          >
            <option value="live">Live stack</option>
            <option value="stub">Faithful stub</option>
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-slate-300">Screens</span>
          <input
            type="number"
            min={1}
            className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            value={config.venue.screens}
            onChange={(event) =>
              setConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      venue: { ...prev.venue, screens: Number(event.target.value) },
                    }
                  : prev,
              )
            }
            disabled={running}
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-slate-300">Occupancy (0–1)</span>
          <input
            type="number"
            min={0.01}
            max={1}
            step={0.01}
            className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            value={config.venue.occupancy}
            onChange={(event) =>
              setConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      venue: { ...prev.venue, occupancy: Number(event.target.value) },
                    }
                  : prev,
              )
            }
            disabled={running}
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-slate-300">Showtime</span>
          <input
            type="datetime-local"
            className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            value={config.showtime.slice(0, 16)}
            onChange={(event) =>
              setConfig((prev) =>
                prev ? { ...prev, showtime: new Date(event.target.value).toISOString() } : prev,
              )
            }
            disabled={running}
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-slate-300">Popcorn-lg override</span>
          <input
            type="number"
            min={0}
            className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            value={config.stockOverrides?.["popcorn-lg"] ?? ""}
            placeholder="default"
            onChange={(event) => {
              const value = event.target.value;
              setConfig((prev) => {
                if (!prev) {
                  return prev;
                }
                const stockOverrides = { ...(prev.stockOverrides ?? {}) };
                if (value === "") {
                  delete stockOverrides["popcorn-lg"];
                } else {
                  stockOverrides["popcorn-lg"] = Number(value);
                }
                return {
                  ...prev,
                  stockOverrides: Object.keys(stockOverrides).length > 0 ? stockOverrides : undefined,
                };
              });
            }}
            disabled={running}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="rounded bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50"
          onClick={() => void handleRun()}
          disabled={running}
        >
          {running ? "Running..." : "Run simulation"}
        </button>
        {run && running ? (
          <button
            type="button"
            className="rounded border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
            onClick={() => void handleCancel()}
          >
            Cancel
          </button>
        ) : null}
        {report ? (
          <button
            type="button"
            className="rounded border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
            onClick={downloadReport}
          >
            Download report JSON
          </button>
        ) : null}
      </div>

      {run ? (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded border border-slate-800 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Status</p>
            <p className="mt-1 text-lg font-medium text-white">{run.status}</p>
            <p className="mt-2 text-sm text-slate-400">
              {run.completedOrders} ok / {run.failedOrders} failed / {run.totalPatrons} patrons
            </p>
            {Object.keys(run.liveMetrics.statusCounts).length > 0 ? (
              <p className="mt-1 text-xs text-slate-500">
                HTTP:{" "}
                {Object.entries(run.liveMetrics.statusCounts)
                  .map(([code, count]) => `${code}×${count}`)
                  .join(", ")}
              </p>
            ) : null}
          </div>
          <div className="rounded border border-slate-800 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">p95 latency</p>
            <p className="mt-1 text-lg font-medium text-white">
              {formatMs(run.liveMetrics.p95LatencyMs)}
            </p>
            <p className="mt-2 text-sm text-slate-400">
              p50 {formatMs(run.liveMetrics.p50LatencyMs)}
            </p>
          </div>
          <div className="rounded border border-slate-800 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Throughput</p>
            <p className="mt-1 text-lg font-medium text-white">
              {run.liveMetrics.ordersPerSecond.toFixed(2)} orders/s
            </p>
            <div className="mt-2">
              <Sparkline values={throughputSeries} />
            </div>
          </div>
        </div>
      ) : null}

      {run?.liveMetrics.queueDepths ? (
        <div className="rounded border border-slate-800 p-4">
          <p className="text-sm font-medium text-white">Queue depths</p>
          <div className="mt-2 grid gap-2 text-sm text-slate-300 md:grid-cols-3">
            <p>Cart cleanup: {run.liveMetrics.queueDepths.cartCleanup}</p>
            <p>Analytics: {run.liveMetrics.queueDepths.analytics}</p>
            <p>Item zero stock: {run.liveMetrics.queueDepths.itemZeroStock}</p>
          </div>
          <p className="mt-2 text-sm text-slate-400">
            Stock-sync lag: {formatMs(run.liveMetrics.stockSyncLagMs)} (max delta{" "}
            {run.liveMetrics.stockSyncMaxDelta})
          </p>
        </div>
      ) : null}

      {hotStock.length > 0 ? (
        <div className="rounded border border-slate-800 p-4">
          <p className="text-sm font-medium text-white">Lowest stock (Redis)</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-300">
            {hotStock.map(([itemId, level]) => (
              <li key={itemId}>
                {itemId}: {level}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {report ? (
        <div className="rounded border border-slate-800 p-4">
          <p className="text-sm font-medium text-white">Break-first report</p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{report.summary}</p>
          {report.oversellEvents > 0 ? (
            <p className="mt-2 text-sm text-red-400">
              Oversell events detected: {report.oversellEvents}
            </p>
          ) : (
            <p className="mt-2 text-sm text-emerald-400">Oversell events: 0</p>
          )}
        </div>
      ) : null}

      {run?.error ? <ErrorBanner message={run.error} /> : null}
    </section>
  );
}
