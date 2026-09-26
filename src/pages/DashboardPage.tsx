import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useBranch } from "@/context/BranchContext";
import { supabase } from "@/lib/supabase";
import { cn, formatPeso } from "@/lib/utils";

const manilaToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

/**
 * Central view. Super admins see all 10 branches; managers see only the
 * branches RLS allows (views use security_invoker, so RLS applies).
 */
export function DashboardPage() {
  const { branches, activeBranch, isSuperAdmin } = useBranch();
  const qc = useQueryClient();
  const today = manilaToday();

  const scope = isSuperAdmin && !activeBranch ? branches : branches.filter((b) => !activeBranch || b.branch.id === activeBranch.id);
  const ids = scope.map((b) => b.branch.id);

  const sales = useQuery({
    queryKey: ["dashboard-sales", today, ids.join()],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("v_branch_daily_sales").select("*").eq("sale_date", today).in("branch_id", ids);
      if (error) throw error;
      return new Map(data.map((r) => [r.branch_id, r]));
    },
    refetchInterval: 60_000,
  });

  const low = useQuery({
    queryKey: ["dashboard-low", ids.join()],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("v_low_stock").select("branch_id, product_name").in("branch_id", ids);
      if (error) throw error;
      const counts = new Map<string, number>();
      data.forEach((r) => counts.set(r.branch_id, (counts.get(r.branch_id) ?? 0) + 1));
      return counts;
    },
  });

  // New sale anywhere in scope: refresh totals.
  useEffect(() => {
    const channel = supabase
      .channel("dashboard-sales")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "transactions" }, () => {
        void qc.invalidateQueries({ queryKey: ["dashboard-sales"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);

  const grand = [...(sales.data?.values() ?? [])].reduce(
    (acc, r) => ({ net: acc.net + r.net_sales, txns: acc.txns + r.txn_count }),
    { net: 0, txns: 0 },
  );

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">Today across {scope.length} {scope.length === 1 ? "branch" : "branches"}</h1>
          <p className="text-muted">{new Date().toLocaleDateString("en-PH", { dateStyle: "full", timeZone: "Asia/Manila" })}</p>
        </div>
        <div className="text-right">
          <p className="text-4xl font-extrabold tabular-nums text-ube-dark">{formatPeso(grand.net)}</p>
          <p className="text-sm text-muted">{grand.txns} sales</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>By branch</CardTitle></CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="px-4 py-2 font-semibold">Branch</th>
                <th className="px-4 py-2 text-right font-semibold">Net sales</th>
                <th className="px-4 py-2 text-right font-semibold">Cash</th>
                <th className="px-4 py-2 text-right font-semibold">GCash / QR Ph</th>
                <th className="px-4 py-2 text-right font-semibold">Sales</th>
                <th className="px-4 py-2 text-right font-semibold">Low stock items</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {scope.map(({ branch }) => {
                const s = sales.data?.get(branch.id);
                const lowCount = low.data?.get(branch.id) ?? 0;
                return (
                  <tr key={branch.id}>
                    <td className="px-4 py-2">
                      <span className="font-semibold">{branch.name}</span>
                    </td>
                    <td className="px-4 py-2 text-right font-bold tabular-nums">{formatPeso(s?.net_sales ?? 0)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatPeso(s?.cash_sales ?? 0)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatPeso(s?.ewallet_sales ?? 0)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{s?.txn_count ?? 0}</td>
                    <td className={cn("px-4 py-2 text-right tabular-nums font-semibold", lowCount > 0 ? "text-danger" : "text-muted")}>
                      {lowCount}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
