import { Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/context/AuthContext";
import { useBranch } from "@/context/BranchContext";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { DashboardPage } from "@/pages/DashboardPage";
import { DrawerPage } from "@/pages/DrawerPage";
import { InventoryPage } from "@/pages/InventoryPage";
import { LoginPage } from "@/pages/LoginPage";
import { POSPage } from "@/pages/POSPage";
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
        <Route path="/drawer" element={<DrawerPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/transfers" element={<TransfersPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/pos" replace />} />
    </Routes>
  );
}
