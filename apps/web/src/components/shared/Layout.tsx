import { Link, Outlet } from "react-router-dom";

export function Layout() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-700 bg-slate-900/80 px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">ApexFlo</h1>
            <p className="text-xs text-slate-400">In-Cinema Commerce</p>
          </div>
          <nav className="flex gap-4 text-sm">
            <Link to="/" className="text-slate-300 hover:text-white">
              Patron
            </Link>
            <Link to="/admin" className="text-slate-300 hover:text-white">
              Admin
            </Link>
          </nav>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
