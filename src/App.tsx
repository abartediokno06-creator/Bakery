import { Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/context/AuthContext";
import { useBranch } from "@/context/BranchContext";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { DashboardPage } from "@/pages/DashboardPage";
import { DrawerPage } from "@/pages/DrawerPage";
import { EndOfDayPage } from "@/pages/EndOfDayPage";
import { InventoryPage } from "@/pages/InventoryPage";
import { LoginPage } from "@/pages/LoginPage";
import { OrdersPage } from "@/pages/OrdersPage";
import { POSPage } from "@/pages/POSPage";
import { ProductsPage } from "@/pages/ProductsPage";
import { ReportsPage } from "@/pages/ReportsPage";
import { SalesPage } from "@/pages/SalesPage";
import { StaffPage } from "@/pages/StaffPage";
import { TransfersPage } from "@/pages/TransfersPage";

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { branches, isSuperAdmin, loading: branchLoading } = useBranch();
  if (loading || (user && branchLoading)) return <p className="p-8 text-muted">Loading...</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (!isSuperAdmin && branches.length === 0) {
    return (
      <p className="p-8 text-muted">
        Your account is not assigned to a branch yet. Ask the owner to add you to one.
      </p>
    );
  }
  return <>{children}</>;
}

/**
 * Where each person starts. The owner monitors, so they land on the dashboard
 * (no cash drawer needed). Staff who sell land on Sell; bakers on Stock.
 */
function HomeRedirect() {
  const { branches, isSuperAdmin, can } = useBranch();
  // Check every branch, not just the active one: it may not be picked yet.
  const sells = branches.some((b) => can("pos.sell", b.branch.id));
  return <Navigate to={isSuperAdmin ? "/dashboard" : sells ? "/pos" : "/inventory"} replace />;
}

export default function App() {
  useOfflineSync();
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/pos" element={<POSPage />} />
        <Route path="/sales" element={<SalesPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/end-of-day" element={<EndOfDayPage />} />
        <Route path="/drawer" element={<DrawerPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/transfers" element={<TransfersPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/staff" element={<StaffPage />} />
        {/* Inside RequireAuth so the role is loaded before choosing a home. */}
        <Route path="*" element={<HomeRedirect />} />
      </Route>
    </Routes>
  );
}
