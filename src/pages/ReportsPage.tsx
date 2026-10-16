import { useMemo, useState, type ReactNode } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Download, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useBranch } from "@/context/BranchContext";
import { downloadCsv } from "@/lib/csv";
import { formatDateTime, lastDaysRange, manilaDay, shiftDay } from "@/lib/dates";
import { supabase, toErrorMessage } from "@/lib/supabase";
import { cn, formatPeso, formatQty } from "@/lib/utils";

const PERIODS = [
  { id: "today", label: "Today", days: 1 },
  { id: "7d", label: "Last 7 days", days: 7 },
  { id: "30d", label: "Last 30 days", days: 30 },
] as const;

const TABS = [
  { id: "sellers", label: "Best sellers" },
  { id: "hours", label: "Sales by hour" },
  { id: "waste", label: "Waste" },
  { id: "cashiers", label: "Cashier over/short" },
  { id: "stock", label: "Stock history" },
  { id: "transfers", label: "Transfers" },
  { id: "senior", label: "Senior/PWD log" },
  { id: "orders", label: "Special orders" },
] as const;

type PeriodId = (typeof PERIODS)[number]["id"];
type TabId = (typeof TABS)[number]["id"];

/** Everything a report needs to agree with the others: same branches, same dates. */
type Scope = {
  ids: string[];
  from: string;
  to: string;
  fromDay: string;
  toDay: string;
  branchName: (id: string) => string;
  fileTag: string;
};

type QueryState = { isLoading: boolean; isPlaceholderData: boolean; error: unknown };

const num = (v: unknown) => Number(v ?? 0);
const qtyText = (n: number) => (Number.isInteger(n) ? n.toLocaleString("en-PH") : n.toFixed(2));
const compactPeso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  notation: "compact",
  maximumFractionDigits: 1,
});
const salesText = (n: number) => `${n} ${n === 1 ? "sale" : "sales"}`;
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;
const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00+08:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric" });

export function ReportsPage() {
  const { activeBranch, branches, can } = useBranch();
  const [period, setPeriod] = useState<PeriodId>("7d");
  const [tab, setTab] = useState<TabId>("sellers");

  const days = PERIODS.find((p) => p.id === period)?.days ?? 7;
  const names = useMemo(() => new Map(branches.map((b) => [b.branch.id, b.branch.name])), [branches]);
  const toDay = manilaDay();
  const fromDay = shiftDay(toDay, -(days - 1));
  const scope: Scope = {
    ids: activeBranch ? [activeBranch.id] : branches.map((b) => b.branch.id),
    ...lastDaysRange(days),
    fromDay,
    toDay,
    branchName: (id) => names.get(id) ?? "",
    fileTag: `${activeBranch?.code ?? "all-branches"}_${fromDay}_to_${toDay}`,
  };

  if (!can("reports.view")) return <p className="p-8 text-muted">Reports are for managers and the owner.</p>;

  return (
    <div className="space-y-4 p-3 sm:p-4">
      <div>
        <h1 className="text-2xl font-extrabold text-ink">Reports</h1>
        <p className="text-muted">
          {activeBranch?.name ?? `All ${branches.length} branches`} ·{" "}
          {days === 1 ? dayLabel(toDay) : `${dayLabel(fromDay)} to ${dayLabel(toDay)}`}
        </p>
      </div>

      {/* One filter row, above everything it scopes. */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Period">
        {PERIODS.map((p) => (
          <Button
            key={p.id}
            size="sm"
            variant={period === p.id ? "primary" : "secondary"}
            aria-pressed={period === p.id}
            onClick={() => setPeriod(p.id)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <SummaryTiles scope={scope} />

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Report">
        {TABS.map((x) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={tab === x.id}
            onClick={() => setTab(x.id)}
            className={cn(
              "h-11 shrink-0 rounded-full px-4 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
              tab === x.id ? "bg-brand text-white" : "border border-line bg-white text-ink hover:bg-brand-light",
            )}
          >
            {x.label}
          </button>
        ))}
      </div>

      {tab === "sellers" && <BestSellers scope={scope} />}
      {tab === "hours" && <SalesByHour scope={scope} />}
      {tab === "waste" && <Waste scope={scope} />}
      {tab === "cashiers" && <CashierVariance scope={scope} />}
      {tab === "stock" && <StockHistory scope={scope} />}
      {tab === "transfers" && <TransferHistory scope={scope} />}
      {tab === "senior" && <SeniorPwdLog scope={scope} />}
      {tab === "orders" && <SpecialOrdersReport scope={scope} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function ReportCard({
  title,
  subtitle,
  q,
  onCsv,
  table = true,
  children,
}: {
  title: string;
  subtitle?: string;
  q: QueryState;
  onCsv?: () => void;
  /** Tables scroll sideways on phones; charts must not (tooltips would clip). */
  table?: boolean;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
        {onCsv && (
          <Button size="sm" variant="secondary" onClick={onCsv} disabled={q.isLoading || Boolean(q.error)}>
            <Download className="h-4 w-4" aria-hidden /> CSV
          </Button>
        )}
      </CardHeader>
      {/* Refetch keeps the previous result, dimmed, instead of flashing. */}
      <div className={cn("transition-opacity", table && "overflow-x-auto", q.isPlaceholderData && "opacity-60")}>
        {q.isLoading ? (
          <p className="p-6 text-muted">Loading…</p>
        ) : q.error ? (
          <p role="alert" className="p-6 text-danger">{toErrorMessage(q.error)}</p>
        ) : (
          children
        )}
      </div>
    </Card>
  );
}

const Empty = ({ children = "Nothing in this period yet." }: { children?: ReactNode }) => (
  <p className="px-4 py-10 text-center text-muted">{children}</p>
);

const TH = "px-4 py-2 text-left text-xs font-bold uppercase tracking-wide text-muted";
const THR = cn(TH, "text-right");
const TD = "px-4 py-2";
const TDR = "px-4 py-2 text-right tabular-nums";

/** Thin horizontal bar: 10px tall, square at the baseline, 4px rounded data end. */
function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2.5 w-full min-w-[80px] rounded-r bg-brand-light" aria-hidden>
      <div className="h-full rounded-r-[4px] bg-brand" style={{ width: value > 0 ? `max(3px, ${pct}%)` : 0 }} />
    </div>
  );
}

function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-muted">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-ink">{value}</p>
      {note && <p className="text-xs text-muted">{note}</p>}
    </div>
  );
}

function SummaryTiles({ scope }: { scope: Scope }) {
  const q = useQuery({
    queryKey: ["rep-summary", scope.ids.join(), scope.fromDay, scope.toDay],
    enabled: scope.ids.length > 0,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_branch_daily_sales")
        .select("net_sales, txn_count, cash_sales, ewallet_sales")
        .in("branch_id", scope.ids)
        .gte("sale_date", scope.fromDay)
        .lte("sale_date", scope.toDay);
      if (error) throw error;
      return data.reduce(
        (a, r) => ({
          net: a.net + num(r.net_sales),
          txns: a.txns + num(r.txn_count),
          cash: a.cash + num(r.cash_sales),
          ewallet: a.ewallet + num(r.ewallet_sales),
        }),
        { net: 0, txns: 0, cash: 0, ewallet: 0 },
      );
    },
  });
  const s = q.data ?? { net: 0, txns: 0, cash: 0, ewallet: 0 };
  return (
    <div className={cn("grid grid-cols-2 gap-3 transition-opacity lg:grid-cols-4", q.isPlaceholderData && "opacity-60")}>
      <StatTile label="Net sales" value={formatPeso(s.net)} />
      <StatTile label="Sales" value={s.txns.toLocaleString("en-PH")} />
      <StatTile label="Average sale" value={formatPeso(s.txns ? s.net / s.txns : 0)} />
      <StatTile label="Cash / GCash + QR Ph" value={formatPeso(s.cash)} note={`${formatPeso(s.ewallet)} e-wallet`} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Best sellers
// ---------------------------------------------------------------------------

function BestSellers({ scope }: { scope: Scope }) {
  const q = useQuery({
    queryKey: ["rep-sellers", scope.ids.join(), scope.from, scope.to],
    enabled: scope.ids.length > 0,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("report_best_sellers", {
        p_branch_ids: scope.ids,
        p_from: scope.from,
        p_to: scope.to,
      });
      if (error) throw error;
      return data.map((r) => ({ ...r, qty: num(r.qty), revenue: num(r.revenue) }));
    },
  });
  const rows = q.data ?? [];
  const max = Math.max(0, ...rows.map((r) => r.qty));

  return (
    <ReportCard
      title="Best sellers"
      subtitle="Quantity sold, most first. Sales amounts are before order discounts."
      q={q}
      onCsv={() =>
        downloadCsv(`best-sellers_${scope.fileTag}.csv`, [
          ["Rank", "Product", "Qty sold", "Sales before discounts"],
          ...rows.map((r, i) => [i + 1, r.product_name, r.qty, r.revenue]),
        ])
      }
    >
      {rows.length === 0 ? (
        <Empty />
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-line">
            <tr>
              <th className={TH}>#</th>
              <th className={TH}>Product</th>
              <th className={TH}>
                <span className="sr-only">Share</span>
              </th>
              <th className={THR}>Qty sold</th>
              <th className={THR}>Sales</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r, i) => (
              <tr key={r.product_id}>
                <td className={cn(TD, "w-10 tabular-nums text-muted")}>{i + 1}</td>
                <td className={cn(TD, "font-bold")}>{r.product_name}</td>
                <td className={cn(TD, "w-1/3")}>
                  <Bar value={r.qty} max={max} />
                </td>
                <td className={cn(TDR, "font-bold")}>{qtyText(r.qty)}</td>
                <td className={TDR}>{formatPeso(r.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ReportCard>
  );
}

// ---------------------------------------------------------------------------
// Sales by hour (column chart + table view)
// ---------------------------------------------------------------------------

/** Round an axis maximum up to 1, 2, or 5 times a power of ten. */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(v));
  const f = v / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
}

function SalesByHour({ scope }: { scope: Scope }) {
  const [active, setActive] = useState<number | null>(null);
  const q = useQuery({
    queryKey: ["rep-hours", scope.ids.join(), scope.from, scope.to],
    enabled: scope.ids.length > 0,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("report_sales_by_hour", {
        p_branch_ids: scope.ids,
        p_from: scope.from,
        p_to: scope.to,
      });
      if (error) throw error;
      return data.map((r) => ({ hour: num(r.hour), txns: num(r.txn_count), net: num(r.net_sales) }));
    },
  });

  const data = q.data ?? [];
  const byHour = new Map(data.map((d) => [d.hour, d]));
  // Bakery hours by default; widen if sales happened outside them.
  const first = Math.min(5, ...data.map((d) => d.hour));
  const last = Math.max(21, ...data.map((d) => d.hour));
  const hours = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const max = niceMax(Math.max(0, ...data.map((d) => d.net)));
  const peak = data.reduce<(typeof data)[number] | null>((a, d) => (!a || d.net > a.net ? d : a), null);

  return (
    <ReportCard
      title="Sales by hour"
      subtitle="Net sales per hour of the day (Philippine time). Use it to time your bakes."
      q={q}
      table={false}
      onCsv={() =>
        downloadCsv(`sales-by-hour_${scope.fileTag}.csv`, [
          ["Hour", "Sales", "Net sales"],
          ...data.map((d) => [hourLabel(d.hour), d.txns, d.net]),
        ])
      }
    >
      {data.length === 0 ? (
        <Empty />
      ) : (
        <div className="px-4 pb-4 pt-8">
          <div className="relative h-56">
            {/* Recessive hairline grid: 0, half, max. */}
            {[1, 0.5, 0].map((f) => (
              <div key={f} className="absolute inset-x-0 border-t border-line" style={{ bottom: `${f * 100}%` }}>
                <span className="absolute -top-2 left-0 bg-white pr-1 text-[11px] tabular-nums text-muted">
                  {compactPeso.format(max * f)}
                </span>
              </div>
            ))}
            <div className="absolute inset-y-0 left-12 right-0 flex items-end gap-[2px]">
              {hours.map((h) => {
                const d = byHour.get(h);
                const v = d?.net ?? 0;
                const pct = (v / max) * 100;
                const label = `${hourLabel(h)}: ${formatPeso(v)}, ${salesText(d?.txns ?? 0)}`;
                return (
                  <button
                    key={h}
                    type="button"
                    aria-label={label}
                    onPointerEnter={() => setActive(h)}
                    onPointerLeave={() => setActive(null)}
                    onFocus={() => setActive(h)}
                    onBlur={() => setActive(null)}
                    className="group relative flex h-full min-w-0 flex-1 items-end justify-center rounded-t focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <span
                      className={cn(
                        "block w-full max-w-[24px] rounded-t-[4px] bg-brand transition-opacity",
                        active !== null && active !== h && "opacity-50",
                      )}
                      style={{ height: v > 0 ? `max(2px, ${pct}%)` : 0 }}
                    />
                    {peak?.hour === h && active === null && v > 0 && (
                      <span
                        className="pointer-events-none absolute whitespace-nowrap text-xs font-bold text-ink"
                        style={{ bottom: `min(calc(${pct}% + 4px), calc(100% - 16px))` }}
                      >
                        {compactPeso.format(v)}
                      </span>
                    )}
                    {active === h && (
                      <span
                        role="tooltip"
                        className="pointer-events-none absolute z-10 whitespace-nowrap rounded-xl border border-line bg-white px-3 py-2 text-left shadow-lg"
                        style={{ bottom: `min(calc(${pct}% + 8px), calc(100% - 52px))` }}
                      >
                        <span className="block text-sm font-extrabold text-ink">{formatPeso(v)}</span>
                        <span className="block text-xs text-muted">
                          {hourLabel(h)} · {salesText(d?.txns ?? 0)}
                        </span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="ml-12 mt-1 flex gap-[2px]" aria-hidden>
            {hours.map((h) => (
              <span key={h} className="min-w-0 flex-1 text-center text-[11px] tabular-nums text-muted">
                {h % 3 === 0 ? hourLabel(h).replace(" ", "") : ""}
              </span>
            ))}
          </div>

          {/* Table view: every value without hovering. */}
          <details className="mt-4 rounded-xl border border-line">
            <summary className="cursor-pointer px-4 py-2 text-sm font-bold text-brand">See the numbers</summary>
            <table className="w-full text-sm">
              <thead className="border-b border-line">
                <tr>
                  <th className={TH}>Hour</th>
                  <th className={THR}>Sales</th>
                  <th className={THR}>Net sales</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.map((d) => (
                  <tr key={d.hour}>
                    <td className={TD}>{hourLabel(d.hour)}</td>
                    <td className={TDR}>{d.txns}</td>
                    <td className={TDR}>{formatPeso(d.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      )}
    </ReportCard>
  );
}

// ---------------------------------------------------------------------------
// Waste
// ---------------------------------------------------------------------------

const HIGH_WASTE = 15; // percent

function Waste({ scope }: { scope: Scope }) {
  const q = useQuery({
    queryKey: ["rep-waste", scope.ids.join(), scope.from, scope.to],
    enabled: scope.ids.length > 0,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("report_waste", {
        p_branch_ids: scope.ids,
        p_from: scope.from,
        p_to: scope.to,
      });
      if (error) throw error;
      return data
        .map((r) => {
          const sold = num(r.sold_qty);
          const wasted = num(r.wasted_qty);
          return { ...r, sold, wasted, pct: sold + wasted > 0 ? (wasted / (sold + wasted)) * 100 : 0 };
        })
        .sort((a, b) => b.pct - a.pct || b.wasted - a.wasted);
    },
  });
  const rows = q.data ?? [];

  return (
    <ReportCard
      title="Waste"
      subtitle="Leftovers and spoilage as a share of everything that left the shelf. Record leftovers at closing to keep this accurate."
      q={q}
      onCsv={() =>
        downloadCsv(`waste_${scope.fileTag}.csv`, [
          ["Product", "Unit", "Sold", "Wasted", "Waste %"],
          ...rows.map((r) => [r.product_name, r.unit, r.sold, r.wasted, r.pct.toFixed(1)]),
        ])
      }
    >
      {rows.length === 0 ? (
        <Empty />
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-line">
            <tr>
              <th className={TH}>Product</th>
              <th className={THR}>Sold</th>
              <th className={THR}>Wasted</th>
              <th className={THR}>Waste %</th>
              <th className={TH}>
                <span className="sr-only">Share</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.product_id}>
                <td className={cn(TD, "font-bold")}>
                  <span className="flex flex-wrap items-center gap-2">
                    {r.product_name}
                    {r.pct >= HIGH_WASTE && (
                      <Badge tone="warn">
                        <TriangleAlert className="h-3 w-3" aria-hidden /> High waste
                      </Badge>
                    )}
                  </span>
                </td>
                <td className={TDR}>{formatQty(r.sold, r.unit)}</td>
                <td className={TDR}>{formatQty(r.wasted, r.unit)}</td>
                <td className={cn(TDR, "font-bold")}>{r.pct.toFixed(1)}%</td>
                <td className={cn(TD, "w-1/4")}>
                  <Bar value={r.pct} max={100} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ReportCard>
  );
}

// ---------------------------------------------------------------------------
// Cashier over / short
// ---------------------------------------------------------------------------

function VarianceLabel({ value }: { value: number }) {
  if (value < 0) return <Badge tone="bad">Short {formatPeso(-value)}</Badge>;
  if (value > 0) return <Badge tone="warn">Over {formatPeso(value)}</Badge>;
  return <Badge tone="good">Exact</Badge>;
}

function CashierVariance({ scope }: { scope: Scope }) {
  const q = useQuery({
    queryKey: ["rep-cashiers", scope.ids.join(), scope.from, scope.to],
    enabled: scope.ids.length > 0,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_shifts")
        .select(
          "id, branch_id, opened_at, closed_at, expected_cash, closing_count, variance, cashier:profiles!cash_shifts_cashier_id_fkey(full_name)",
        )
        .eq("status", "closed")
        .in("branch_id", scope.ids)
        .gte("closed_at", scope.from)
        .lt("closed_at", scope.to)
        .order("closed_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const rows = q.data ?? [];

  const byCashier = useMemo(() => {
    const m = new Map<string, { name: string; shifts: number; short: number; total: number }>();
    for (const r of rows) {
      const name = r.cashier?.full_name ?? "Unknown";
      const e = m.get(name) ?? { name, shifts: 0, short: 0, total: 0 };
      e.shifts += 1;
      e.total += num(r.variance);
      if (num(r.variance) < 0) e.short += 1;
      m.set(name, e);
    }
    return [...m.values()].sort((a, b) => a.total - b.total);
  }, [rows]);

  return (
    <ReportCard
      title="Cashier over/short"
      subtitle="Closed drawers: the cash counted against what the system expected."
      q={q}
      onCsv={() =>
        downloadCsv(`cashier-over-short_${scope.fileTag}.csv`, [
          ["Closed", "Branch", "Cashier", "Expected", "Counted", "Over/short"],
          ...rows.map((r) => [
            r.closed_at ? formatDateTime(r.closed_at) : "",
            scope.branchName(r.branch_id),
            r.cashier?.full_name ?? "",
            num(r.expected_cash),
            num(r.closing_count),
            num(r.variance),
          ]),
        ])
      }
    >
      {rows.length === 0 ? (
        <Empty>No drawers were closed in this period.</Empty>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 border-b border-line bg-surface px-4 py-3">
            {byCashier.map((c) => (
              <span key={c.name} className="rounded-xl border border-line bg-white px-3 py-1.5 text-sm">
                <span className="font-bold">{c.name}</span>{" "}
                <span className="text-muted">
                  · {c.shifts} shift{c.shifts === 1 ? "" : "s"} · {c.short} short ·{" "}
                </span>
                <span className={cn("font-bold tabular-nums", c.total < 0 ? "text-danger" : "text-ink")}>
                  {c.total < 0 ? "−" : c.total > 0 ? "+" : ""}
                  {formatPeso(Math.abs(c.total))}
                </span>
              </span>
            ))}
          </div>
          <table className="w-full text-sm">
            <thead className="border-b border-line">
              <tr>
                <th className={TH}>Closed</th>
                <th className={TH}>Cashier</th>
                <th className={THR}>Expected</th>
                <th className={THR}>Counted</th>
                <th className={THR}>Over/short</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className={TD}>
                    <span className="block whitespace-nowrap">{r.closed_at ? formatDateTime(r.closed_at) : ""}</span>
                    <span className="block text-xs text-muted">{scope.branchName(r.branch_id)}</span>
                  </td>
                  <td className={cn(TD, "font-bold")}>{r.cashier?.full_name}</td>
                  <td className={TDR}>{formatPeso(num(r.expected_cash))}</td>
                  <td className={TDR}>{formatPeso(num(r.closing_count))}</td>
                  <td className={cn(TD, "text-right")}>
                    <VarianceLabel value={num(r.variance)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </ReportCard>
  );
}

// ---------------------------------------------------------------------------
// Stock history (inventory ledger)
// ---------------------------------------------------------------------------

const REASON_LABEL: Record<string, string> = {
  sale: "Sale",
  sale_void: "Voided sale",
  transfer_out: "Sent to another branch",
  transfer_in: "Received from a branch",
  production_consume: "Used in baking",
  production_output: "Baked",
  adjustment: "Count correction",
  spoilage: "Leftovers / spoilage",
  initial: "Opening stock",
};

const HISTORY_LIMIT = 300;

function StockHistory({ scope }: { scope: Scope }) {
  const q = useQuery({
    queryKey: ["rep-stock", scope.ids.join(), scope.from, scope.to],
    enabled: scope.ids.length > 0,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("id, created_at, branch_id, qty_change, qty_after, reason, note, product:products(name, unit), by:profiles(full_name)")
        .in("branch_id", scope.ids)
        .gte("created_at", scope.from)
        .lt("created_at", scope.to)
        .order("created_at", { ascending: false })
        .limit(HISTORY_LIMIT);
      if (error) throw error;
      return data;
    },
  });
  const rows = q.data ?? [];

  return (
    <ReportCard
      title="Stock history"
      subtitle={`Every stock change: who, when, and why. Latest ${HISTORY_LIMIT} shown.`}
      q={q}
      onCsv={() =>
        downloadCsv(`stock-history_${scope.fileTag}.csv`, [
          ["When", "Branch", "Product", "Change", "After", "Reason", "Note", "By"],
          ...rows.map((r) => [
            formatDateTime(r.created_at),
            scope.branchName(r.branch_id),
            r.product?.name ?? "",
            num(r.qty_change),
            num(r.qty_after),
            REASON_LABEL[r.reason] ?? r.reason,
            r.note ?? "",
            r.by?.full_name ?? "",
          ]),
        ])
      }
    >
      {rows.length === 0 ? (
        <Empty />
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-line">
            <tr>
              <th className={TH}>When</th>
              <th className={TH}>Product</th>
              <th className={THR}>Change</th>
              <th className={THR}>After</th>
              <th className={TH}>Reason</th>
              <th className={TH}>By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => {
              const change = num(r.qty_change);
              return (
                <tr key={r.id}>
                  <td className={TD}>
                    <span className="block whitespace-nowrap">{formatDateTime(r.created_at)}</span>
                    {scope.ids.length > 1 && <span className="block text-xs text-muted">{scope.branchName(r.branch_id)}</span>}
                  </td>
                  <td className={cn(TD, "font-bold")}>{r.product?.name}</td>
                  <td className={cn(TDR, "font-bold", change < 0 ? "text-danger" : "text-leaf")}>
                    {change > 0 ? "+" : "−"}
                    {qtyText(Math.abs(change))}
                  </td>
                  <td className={TDR}>{qtyText(num(r.qty_after))}</td>
                  <td className={TD}>
                    <span className="block">{REASON_LABEL[r.reason] ?? r.reason}</span>
                    {r.note && <span className="block text-xs text-muted">{r.note}</span>}
                  </td>
                  <td className={cn(TD, "text-muted")}>{r.by?.full_name}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </ReportCard>
  );
}

// ---------------------------------------------------------------------------
// Transfers
// ---------------------------------------------------------------------------

const TRANSFER_LABEL: Record<string, { label: string; tone: "brand" | "warn" | "good" | "neutral" }> = {
  requested: { label: "Requested", tone: "brand" },
  dispatched: { label: "On the way", tone: "warn" },
  received: { label: "Received", tone: "good" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

function TransferHistory({ scope }: { scope: Scope }) {
  const q = useQuery({
    queryKey: ["rep-transfers", scope.ids.join(), scope.from, scope.to],
    enabled: scope.ids.length > 0,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const list = scope.ids.join(",");
      const { data, error } = await supabase
        .from("stock_transfers")
        .select(
          "id, transfer_no, status, requested_at, received_at, from_branch:branches!stock_transfers_from_branch_id_fkey(name), to_branch:branches!stock_transfers_to_branch_id_fkey(name), items:stock_transfer_items(qty_requested, qty_received)",
        )
        .or(`from_branch_id.in.(${list}),to_branch_id.in.(${list})`)
        .gte("requested_at", scope.from)
        .lt("requested_at", scope.to)
        .order("requested_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const rows = q.data ?? [];

  return (
    <ReportCard
      title="Transfers"
      subtitle="Stock moved between branches, by request date."
      q={q}
      onCsv={() =>
        downloadCsv(`transfers_${scope.fileTag}.csv`, [
          ["Transfer", "Requested", "From", "To", "Status", "Items", "Qty requested", "Qty received"],
          ...rows.map((r) => [
            r.transfer_no,
            formatDateTime(r.requested_at),
            r.from_branch?.name ?? "",
            r.to_branch?.name ?? "",
            TRANSFER_LABEL[r.status]?.label ?? r.status,
            r.items.length,
            r.items.reduce((s, i) => s + num(i.qty_requested), 0),
            r.items.reduce((s, i) => s + num(i.qty_received), 0),
          ]),
        ])
      }
    >
      {rows.length === 0 ? (
        <Empty />
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-line">
            <tr>
              <th className={TH}>Transfer</th>
              <th className={TH}>From → to</th>
              <th className={THR}>Items</th>
              <th className={TH}>Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => {
              const s = TRANSFER_LABEL[r.status] ?? { label: r.status, tone: "neutral" as const };
              return (
                <tr key={r.id}>
                  <td className={TD}>
                    <span className="block font-bold">{r.transfer_no}</span>
                    <span className="block text-xs text-muted">{formatDateTime(r.requested_at)}</span>
                  </td>
                  <td className={TD}>
                    {r.from_branch?.name} → {r.to_branch?.name}
                  </td>
                  <td className={TDR}>{r.items.length}</td>
                  <td className={TD}>
                    <Badge tone={s.tone}>{s.label}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </ReportCard>
  );
}

// ---------------------------------------------------------------------------
// Senior / PWD discount log (for BIR)
// ---------------------------------------------------------------------------

function SeniorPwdLog({ scope }: { scope: Scope }) {
  const q = useQuery({
    queryKey: ["rep-senior", scope.ids.join(), scope.from, scope.to],
    enabled: scope.ids.length > 0,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("discount_logs")
        .select("id, created_at, branch_id, discount_type, customer_name, id_number, discount_amount, sale:transactions(receipt_no, total, status)")
        .in("branch_id", scope.ids)
        .gte("created_at", scope.from)
        .lt("created_at", scope.to)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const rows = q.data ?? [];
  const counted = rows.filter((r) => r.sale?.status !== "voided");
  const total = counted.reduce((s, r) => s + num(r.discount_amount), 0);

  return (
    <ReportCard
      title="Senior/PWD log"
      subtitle={`${counted.length} discounted sale${counted.length === 1 ? "" : "s"}, ${formatPeso(total)} in discounts (voided sales not counted).`}
      q={q}
      onCsv={() =>
        downloadCsv(`senior-pwd-log_${scope.fileTag}.csv`, [
          ["Date", "Branch", "Receipt", "Type", "Customer name", "ID number", "Sale total", "Discount", "Status"],
          ...rows.map((r) => [
            formatDateTime(r.created_at),
            scope.branchName(r.branch_id),
            r.sale?.receipt_no ?? "",
            r.discount_type === "senior" ? "Senior citizen" : "PWD",
            r.customer_name,
            r.id_number,
            num(r.sale?.total),
            num(r.discount_amount),
            r.sale?.status ?? "",
          ]),
        ])
      }
    >
      {rows.length === 0 ? (
        <Empty>No Senior or PWD discounts in this period.</Empty>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-line">
            <tr>
              <th className={TH}>Date</th>
              <th className={TH}>Receipt</th>
              <th className={TH}>Customer</th>
              <th className={TH}>ID number</th>
              <th className={THR}>Discount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id} className={r.sale?.status === "voided" ? "text-muted line-through" : undefined}>
                <td className={cn(TD, "whitespace-nowrap")}>{formatDateTime(r.created_at)}</td>
                <td className={TD}>
                  <span className="block font-bold">{r.sale?.receipt_no}</span>
                  {scope.ids.length > 1 && <span className="block text-xs text-muted">{scope.branchName(r.branch_id)}</span>}
                </td>
                <td className={TD}>
                  <span className="block font-bold">{r.customer_name}</span>
                  <span className="block text-xs text-muted">{r.discount_type === "senior" ? "Senior citizen" : "PWD"}</span>
                </td>
                <td className={TD}>{r.id_number}</td>
                <td className={TDR}>{formatPeso(num(r.discount_amount))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ReportCard>
  );
}

// ---------------------------------------------------------------------------
// Special orders
// ---------------------------------------------------------------------------

const ORDER_LABEL: Record<string, { label: string; tone: "brand" | "warn" | "good" | "neutral" }> = {
  pending: { label: "Pending", tone: "warn" },
  ready: { label: "Ready", tone: "brand" },
  picked_up: { label: "Picked up", tone: "good" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

function SpecialOrdersReport({ scope }: { scope: Scope }) {
  const q = useQuery({
    queryKey: ["rep-orders", scope.ids.join(), scope.from, scope.to],
    enabled: scope.ids.length > 0,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_special_orders")
        .select("*")
        .in("branch_id", scope.ids)
        .gte("pickup_at", scope.from)
        .lt("pickup_at", scope.to)
        .order("pickup_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const rows = q.data ?? [];
  const live = rows.filter((r) => r.status !== "cancelled");
  const value = live.reduce((s, r) => s + num(r.total), 0);
  const collected = rows.reduce((s, r) => s + num(r.paid), 0);

  return (
    <ReportCard
      title="Special orders"
      subtitle={`Orders with pickup in this period: ${formatPeso(value)} ordered, ${formatPeso(collected)} collected. These are not in the sales totals above.`}
      q={q}
      onCsv={() =>
        downloadCsv(`special-orders_${scope.fileTag}.csv`, [
          ["Order", "Branch", "Customer", "Phone", "Items", "Pickup", "Status", "Total", "Paid", "Balance"],
          ...rows.map((r) => [
            r.order_no,
            scope.branchName(r.branch_id),
            r.customer_name,
            r.customer_phone ?? "",
            r.items,
            formatDateTime(r.pickup_at),
            ORDER_LABEL[r.status]?.label ?? r.status,
            num(r.total),
            num(r.paid),
            num(r.balance),
          ]),
        ])
      }
    >
      {rows.length === 0 ? (
        <Empty>No special orders for pickup in this period.</Empty>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-line">
            <tr>
              <th className={TH}>Order</th>
              <th className={TH}>Pickup</th>
              <th className={TH}>Status</th>
              <th className={THR}>Total</th>
              <th className={THR}>Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => {
              const s = ORDER_LABEL[r.status] ?? { label: r.status, tone: "neutral" as const };
              return (
                <tr key={r.id}>
                  <td className={TD}>
                    <span className="block font-bold">{r.customer_name}</span>
                    <span className="block text-xs text-muted">
                      {r.order_no}
                      {scope.ids.length > 1 && ` · ${scope.branchName(r.branch_id)}`}
                    </span>
                  </td>
                  <td className={cn(TD, "whitespace-nowrap")}>{formatDateTime(r.pickup_at)}</td>
                  <td className={TD}>
                    <Badge tone={s.tone}>{s.label}</Badge>
                  </td>
                  <td className={TDR}>{formatPeso(num(r.total))}</td>
                  <td className={cn(TDR, num(r.balance) > 0 && r.status !== "cancelled" && "font-bold text-danger")}>
                    {formatPeso(num(r.balance))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </ReportCard>
  );
}
