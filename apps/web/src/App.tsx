import { useEffect, useState } from "react";

type HealthResponse = {
  status: string;
  database?: string;
};

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health/db")
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`API returned ${res.status}`);
        }
        return res.json() as Promise<HealthResponse>;
      })
      .then(setHealth)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">ApexFlo</h1>
        <p className="mt-2 text-slate-400">In-Cinema Commerce Platform</p>
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-800/50 px-6 py-4 text-sm">
        {health && (
          <p>
            API: <span className="text-emerald-400">{health.status}</span>
            {health.database && (
              <>
                {" "}
                | DB: <span className="text-emerald-400">{health.database}</span>
              </>
            )}
          </p>
        )}
        {error && <p className="text-amber-400">API unavailable: {error}</p>}
        {!health && !error && <p className="text-slate-400">Checking API health...</p>}
      </div>
    </main>
  );
}
