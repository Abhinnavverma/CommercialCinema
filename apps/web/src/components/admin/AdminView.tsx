import { useAuth } from "../../context/AuthContext.js";
import { AdminLoginForm } from "./AdminLoginForm.js";
import { AnalyticsDashboard } from "./AnalyticsDashboard.js";
import { OrdersTable } from "./OrdersTable.js";
import { SimulationPanel } from "./SimulationPanel.js";
import { StockManager } from "./StockManager.js";

export function AdminView() {
  const { adminToken } = useAuth();

  return (
    <main className="mx-auto max-w-7xl space-y-10 p-6">
      {adminToken ? (
        <>
          <SimulationPanel />
          <AnalyticsDashboard />
          <OrdersTable />
          <StockManager />
        </>
      ) : (
        <AdminLoginForm />
      )}
    </main>
  );
}
