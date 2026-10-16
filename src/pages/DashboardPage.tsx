import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CakeSlice, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useBranch } from "@/context/BranchContext";
import { dayRange, manilaDay } from "@/lib/dates";
import { supabase } from "@/lib/supabase";
import { cn, formatPeso } from "@/lib/utils";

/**
 * Central view. Super admins see all 10 branches; managers see only the
 * branches RLS allows (views use security_invoker, so RLS applies).
 */
export function DashboardPage() {
  const { branches, activeBranch, isSuperAdmin, setActiveBranchId } = useBranch();
  const qc = useQueryClient();
  const today = manilaDay();

  const scope = isSuperAdmin && !activeBranch ? branches : branches.filter((b) => !activeBranch || b.branch.id === activeBranch.id);
  const ids = scope.map((b) => b.branch.id);
  const names = new Map(scope.map((b) => [b.branch.id, b.branch.name]));

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

  // Which drawers are open right now, and the cash that should be in each.
  const drawers = useQuery({
    queryKey: ["dashboard-drawers", ids.join()],
    enabled: ids.length > 0,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_open_drawers")
        .select("*")
        .in("branch_id", ids)
        .order("opened_at");
      if (error) throw error;
      return data;
    },
  });

  const pickups = useQuery({
    queryKey: ["dashboard-pickups", today, ids.join()],
    enabled: ids.length > 0,
    refetchInterval: 120_000,
    queryFn: async () => {
      const { from, to } = dayRange(today);
      const { data, error } = await supabase
        .from("v_special_orders")
        .select("id, order_no, branch_id, customer_name, items, pickup_at, status, balance")
        .in("branch_id", ids)
        .in("status", ["pending", "ready"])
        .gte("pickup_at", from)
        .lt("pickup_at", to)
        .order("pickup_at");
      if (error) throw error;
      return data;
    },
  });

  // New sale anywhere in scope: refresh totals and expected drawer cash.
  useEffect(() => {
    const channel = supabase
      .channel("dashboard-sales")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "transactions" }, () => {
        void qc.invalidateQueries({ queryKey: ["dashboard-sales"] });
        void qc.invalidateQueries({ queryKey: ["dashboard-drawers"] });
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
  const openCount = new Map<string, number>();
  (drawers.data ?? []).forEach((d) => openCount.set(d.branch_id, (openCount.get(d.branch_id) ?? 0) + 1));

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">Today across {scope.length} {scope.length === 1 ? "branch" : "branches"}</h1>
          <p className="text-muted">{new Date().toLocaleDateString("en-PH", { dateStyle: "full", timeZone: "Asia/Manila" })}</p>
        </div>
        <div className="text-right">
          <p className="text-4xl font-extrabold text-brand-dark">{formatPeso(grand.net)}</p>
          <p className="text-sm text-muted">{grand.txns} {grand.txns === 1 ? "sale" : "sales"}</p>
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
                <th className="px-4 py-2 font-semibold">Drawer</th>
                <th className="px-4 py-2 text-right font-semibold">Low stock items</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {scope.map(({ branch }) => {
                const s = sales.data?.get(branch.id);
                const lowCount = low.data?.get(branch.id) ?? 0;
                const open = openCount.get(branch.id) ?? 0;
                return (
                  <tr key={branch.id}>
                    <td className="px-4 py-2">
                      <span className="font-semibold">{branch.name}</span>
                    </td>
                    <td className="px-4 py-2 text-right font-bold tabular-nums">{formatPeso(s?.net_sales ?? 0)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatPeso(s?.cash_sales ?? 0)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatPeso(s?.ewallet_sales ?? 0)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{s?.txn_count ?? 0}</td>
                    <td className="px-4 py-2">
                      {open > 0 ? <Badge tone="good">Open{open > 1 ? ` (${open})` : ""}</Badge> : <Badge tone="neutral">Not open</Badge>}
                    </td>
                    <td className={cn("px-4 py-2 text-right tabular-nums font-semibold", lowCount > 0 ? "text-danger" : "text-muted")}>
                      {lowCount > 0 ? (
                        <Link
                          to="/inventory"
                          onClick={() => setActiveBranchId(branch.id)}
                          className="underline-offset-2 hover:underline"
                        >
                          {lowCount}
                        </Link>
                      ) : (
                        lowCount
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Cash drawers</CardTitle>
              <p className="text-sm text-muted">Open right now, with the cash that should be inside.</p>
            </div>
            <Wallet className="h-6 w-6 text-brand" aria-hidden />
          </CardHeader>
          {(drawers.data ?? []).length === 0 ? (
            <p className="px-4 py-8 text-center text-muted">{drawers.isLoading ? "Loading…" : "No drawer is open."}</p>
          ) : (
            <ul className="divide-y divide-line">
              {(drawers.data ?? []).map((d) => (
                <li key={d.shift_id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold">{names.get(d.branch_id)}</p>
                    <p className="truncate text-sm text-muted">
                      {d.cashier_name ?? "Cashier"} · opened{" "}
                      {new Date(d.opened_at).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" })} ·{" "}
                      {d.txn_count} {d.txn_count === 1 ? "sale" : "sales"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-extrabold tabular-nums">{formatPeso(d.expected_cash)}</p>
                    <p className="text-xs text-muted">started with {formatPeso(d.opening_float)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Pickups today</CardTitle>
              <p className="text-sm text-muted">Special orders due today that are not picked up yet.</p>
            </div>
            <CakeSlice className="h-6 w-6 text-brand" aria-hidden />
          </CardHeader>
          {(pickups.data ?? []).length === 0 ? (
            <p className="px-4 py-8 text-center text-muted">{pickups.isLoading ? "Loading…" : "No pickups due today."}</p>
          ) : (
            <ul className="divide-y divide-line">
              {(pickups.data ?? []).map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold">
                      {new Date(o.pickup_at).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" })} ·{" "}
                      {o.customer_name}
                    </p>
                    <p className="truncate text-sm text-muted">
                      {names.get(o.branch_id)} · {o.items}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone={o.status === "ready" ? "brand" : "warn"}>{o.status === "ready" ? "Ready" : "Pending"}</Badge>
                    {o.balance > 0 && <span className="text-xs font-bold text-danger">{formatPeso(o.balance)} due</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
