import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Printer, ReceiptText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { METHOD_META } from "@/components/pos/POSCheckout";
import { useBranch } from "@/context/BranchContext";
import { useT } from "@/lib/i18n";
import { printReceipt, type ReceiptData } from "@/lib/printReceipt";
import { supabase, toErrorMessage } from "@/lib/supabase";
import { cn, formatPeso } from "@/lib/utils";
import { dayRange, manilaDay, shiftDay } from "@/lib/dates";

export function SalesPage() {
  const { t } = useT();
  const { activeBranch, branches, can } = useBranch();
  const qc = useQueryClient();
  const [day, setDay] = useState(manilaDay());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const ids = activeBranch ? [activeBranch.id] : branches.map((b) => b.branch.id);
  const branchById = useMemo(() => new Map(branches.map((b) => [b.branch.id, b.branch])), [branches]);
  const { from, to } = dayRange(day);

  const sales = useQuery({
    queryKey: ["sales", ids.join(), day],
    enabled: ids.length > 0,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select(
          "id, receipt_no, sold_at, subtotal, discount_total, total, payment_method, amount_tendered, change_due, payment_ref, status, void_reason, branch_id, cashier:profiles!transactions_cashier_id_fkey(full_name)",
        )
        .in("branch_id", ids)
        .gte("sold_at", from)
        .lt("sold_at", to)
        .order("sold_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  const rows = sales.data ?? [];
  const selected = rows.find((r) => r.id === selectedId) ?? null;
  const completed = rows.filter((r) => r.status === "completed");
  const net = completed.reduce((sum, r) => sum + r.total, 0);

  const detail = useQuery({
    queryKey: ["sale-detail", selectedId],
    enabled: Boolean(selectedId),
    queryFn: async () => {
      const [items, log] = await Promise.all([
        supabase
          .from("transaction_items")
          .select("id, product_name, quantity, unit_price, line_total")
          .eq("transaction_id", selectedId!)
          .order("id"),
        supabase
          .from("discount_logs")
          .select("discount_type, customer_name, id_number")
          .eq("transaction_id", selectedId!)
          .maybeSingle(),
      ]);
      if (items.error) throw items.error;
      if (log.error) throw log.error;
      return { items: items.data, log: log.data };
    },
  });

  // On narrow screens the detail sits below the list; bring it into view.
  useEffect(() => {
    if (selectedId && window.innerWidth < 1280) detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedId]);

  const print = () => {
    if (!selected || !detail.data) return;
    const branch = branchById.get(selected.branch_id);
    const log = detail.data.log;
    const receipt: ReceiptData = {
      brand: branch?.brand ?? "",
      branchName: branch?.name ?? "",
      receiptNo: selected.receipt_no,
      soldAt: selected.sold_at,
      cashierName: selected.cashier?.full_name ?? null,
      lines: detail.data.items.map((i) => ({
        name: i.product_name,
        quantity: i.quantity,
        unitPrice: i.unit_price,
        lineTotal: i.line_total,
      })),
      subtotal: selected.subtotal,
      discount: selected.discount_total,
      discountLabel: log
        ? `${log.discount_type === "senior" ? "Senior" : "PWD"} 20%: ${log.customer_name}, ID ${log.id_number}`
        : null,
      total: selected.total,
      methodLabel: METHOD_META[selected.payment_method].label,
      tendered: selected.amount_tendered,
      change: selected.change_due,
      paymentRef: selected.payment_ref,
      voided: selected.status === "voided",
    };
    printReceipt(receipt);
  };

  const today = manilaDay();
  const yesterday = shiftDay(today, -1);

  return (
    <div className="grid gap-4 p-3 sm:p-4 xl:grid-cols-[1fr_400px]">
      <Card className="min-w-0">
        <CardHeader>
          <div>
            <CardTitle>{t("Sales")}</CardTitle>
            <p className="text-sm text-muted">{activeBranch?.name ?? `${branches.length} branches`}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {[
              { value: today, label: t("Today") },
              { value: yesterday, label: t("Yesterday") },
            ].map((d) => (
              <Button key={d.value} size="sm" variant={day === d.value ? "primary" : "secondary"} onClick={() => setDay(d.value)}>
                {d.label}
              </Button>
            ))}
            <Input
              type="date"
              value={day}
              max={today}
              onChange={(e) => e.target.value && setDay(e.target.value)}
              aria-label="Date"
              className="h-10 w-auto"
            />
          </div>
        </CardHeader>

        <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-line bg-surface px-4 py-3 text-sm">
          <span>
            <span className="text-muted">{t("Sales")}: </span>
            <span className="font-extrabold tabular-nums">{completed.length}</span>
          </span>
          <span>
            <span className="text-muted">{t("Net sales")}: </span>
            <span className="font-extrabold tabular-nums text-brand-dark">{formatPeso(net)}</span>
          </span>
          {rows.length > completed.length && (
            <span>
              <span className="text-muted">{t("Voided")}: </span>
              <span className="font-extrabold tabular-nums text-danger">{rows.length - completed.length}</span>
            </span>
          )}
        </div>

        {sales.isLoading ? (
          <p className="p-6 text-muted">…</p>
        ) : sales.error ? (
          <p role="alert" className="p-6 text-danger">{toErrorMessage(sales.error)}</p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-muted">{t("No sales for this day yet.")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => setSelectedId(r.id)}
                  aria-current={r.id === selectedId}
                  className={cn(
                    "grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-brand-light/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand",
                    r.id === selectedId && "bg-brand-light",
                  )}
                >
                  <span className="w-14 text-sm font-bold tabular-nums text-muted">
                    {new Date(r.sold_at).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-bold text-ink">{r.receipt_no}</span>
                    <span className="block truncate text-sm text-muted">
                      {r.cashier?.full_name}
                      {!activeBranch && ` · ${branchById.get(r.branch_id)?.name ?? ""}`}
                      {` · ${t(METHOD_META[r.payment_method].label)}`}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <span className={cn("font-extrabold tabular-nums", r.status === "voided" && "text-muted line-through")}>
                      {formatPeso(r.total)}
                    </span>
                    {r.status === "voided" && <Badge tone="bad">{t("Voided")}</Badge>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div ref={detailRef} className="scroll-mt-4">
        {selected ? (
          <SaleDetail
            key={selected.id}
            sale={selected}
            branchName={branchById.get(selected.branch_id)?.name ?? ""}
            items={detail.data?.items ?? null}
            log={detail.data?.log ?? null}
            canVoid={can("pos.void", selected.branch_id)}
            onPrint={print}
            onVoided={() => {
              void qc.invalidateQueries({ queryKey: ["sales"] });
              void qc.invalidateQueries({ queryKey: ["sale-detail", selected.id] });
            }}
          />
        ) : (
          <Card>
            <CardBody className="flex flex-col items-center gap-2 py-10 text-center text-muted">
              <ReceiptText className="h-10 w-10 text-brand" aria-hidden />
              {t("Tap a sale to see its items.")}
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}

type SaleRow = {
  id: string;
  receipt_no: string;
  sold_at: string;
  subtotal: number;
  discount_total: number;
  total: number;
  payment_method: keyof typeof METHOD_META;
  amount_tendered: number;
  change_due: number;
  payment_ref: string | null;
  status: "completed" | "voided";
  void_reason: string | null;
  cashier: { full_name: string } | null;
};

function SaleDetail({
  sale,
  branchName,
  items,
  log,
  canVoid,
  onPrint,
  onVoided,
}: {
  sale: SaleRow;
  branchName: string;
  items: Array<{ id: number; product_name: string; quantity: number; unit_price: number; line_total: number }> | null;
  log: { discount_type: "senior" | "pwd"; customer_name: string; id_number: string } | null;
  canVoid: boolean;
  onPrint: () => void;
  onVoided: () => void;
}) {
  const { t } = useT();
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");

  const voidSale = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("void_sale", { p_transaction_id: sale.id, p_reason: reason.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      setVoiding(false);
      onVoided();
    },
  });

  const row = (label: string, value: string, strong = false) => (
    <div className={cn("flex justify-between gap-3", strong ? "text-lg font-extrabold" : "text-sm")}>
      <span className={strong ? "text-ink" : "text-muted"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="truncate">{sale.receipt_no}</CardTitle>
          <p className="text-sm text-muted">
            {new Date(sale.sold_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })} · {branchName}
          </p>
        </div>
        {sale.status === "voided" && <Badge tone="bad">{t("Voided")}</Badge>}
      </CardHeader>
      <CardBody className="space-y-4">
        {sale.status === "voided" && sale.void_reason && (
          <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
            {t("Voided: {reason}", { reason: sale.void_reason })}
          </p>
        )}

        {items ? (
          <ul className="divide-y divide-line">
            {items.map((i) => (
              <li key={i.id} className="flex justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block font-bold">{i.product_name}</span>
                  <span className="block text-sm tabular-nums text-muted">
                    {i.quantity} × {formatPeso(i.unit_price)}
                  </span>
                </span>
                <span className="font-bold tabular-nums">{formatPeso(i.line_total)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">…</p>
        )}

        <div className="space-y-1 border-t border-line pt-3">
          {row("Subtotal", formatPeso(sale.subtotal))}
          {sale.discount_total > 0 && row(t("Discount"), `-${formatPeso(sale.discount_total)}`)}
          {log && (
            <p className="rounded-xl bg-surface px-3 py-2 text-sm">
              <span className="font-bold">{log.discount_type === "senior" ? "Senior" : "PWD"}:</span> {log.customer_name} · ID{" "}
              {log.id_number}
            </p>
          )}
          {row(t("Total"), formatPeso(sale.total), true)}
          {row(t(METHOD_META[sale.payment_method].label), formatPeso(sale.amount_tendered))}
          {sale.change_due > 0 && row(t("Change"), formatPeso(sale.change_due))}
          {sale.payment_ref && row(t("Reference no."), sale.payment_ref)}
          {row(t("Cashier"), sale.cashier?.full_name ?? "")}
        </div>

        <Button variant="secondary" className="w-full" onClick={onPrint} disabled={!items}>
          <Printer className="h-5 w-5" aria-hidden /> {t("Print receipt")}
        </Button>

        {sale.status === "completed" &&
          (canVoid ? (
            voiding ? (
              <form
                className="space-y-3 rounded-2xl border border-danger/30 bg-danger/5 p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (reason.trim()) voidSale.mutate();
                }}
              >
                <label className="block text-sm font-bold text-ink">
                  {t("Why is this sale being voided?")}
                  <Input
                    autoFocus
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={t("Reason (required)")}
                    className="mt-1"
                  />
                </label>
                <p className="text-sm text-muted">{t("Voided sales put the items back in stock.")}</p>
                {voidSale.error && <p role="alert" className="text-sm text-danger">{toErrorMessage(voidSale.error)}</p>}
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" onClick={() => setVoiding(false)}>
                    {t("Back")}
                  </Button>
                  <Button type="submit" variant="danger" disabled={!reason.trim() || voidSale.isPending}>
                    {t("Void this sale")}
                  </Button>
                </div>
              </form>
            ) : (
              <Button variant="ghost" className="w-full text-danger hover:bg-danger/10" onClick={() => setVoiding(true)}>
                <Ban className="h-5 w-5" aria-hidden /> {t("Void sale")}
              </Button>
            )
          ) : (
            <p className="text-center text-sm text-muted">{t("Only a manager or the owner can void sales.")}</p>
          ))}
      </CardBody>
    </Card>
  );
}
