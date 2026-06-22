import { useState, type FormEvent } from "react";
import { useAuth } from "../../context/AuthContext.js";
import { ErrorBanner } from "../shared/ErrorBanner.js";

export function AdminLoginForm() {
  const { loginAdmin } = useAuth();
  const [email, setEmail] = useState("admin@apexflo.local");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await loginAdmin(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-sm space-y-4 rounded-lg border border-slate-700 bg-slate-800/50 p-6">
      <h2 className="text-lg font-semibold">Admin Login</h2>
      <label className="block text-sm">
        <span className="text-slate-400">Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded border border-slate-600 bg-slate-900 px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="text-slate-400">Password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded border border-slate-600 bg-slate-900 px-3 py-2"
        />
      </label>
      {error && <ErrorBanner message={error} />}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded bg-emerald-600 py-2 font-medium hover:bg-emerald-500 disabled:opacity-40"
      >
        {loading ? "Signing in..." : "Sign In"}
      </button>
    </form>
  );
}
