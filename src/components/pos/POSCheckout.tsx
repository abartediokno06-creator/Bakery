import { useId, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Banknote, CreditCard, QrCode, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n";
import type { ReceiptData } from "@/lib/printReceipt";
import { cn, formatPeso, newId, round2 } from "@/lib/utils";
import { submitSale } from "@/stores/syncStore";
import { calculateCheckout, quickCashOptions, type OrderDiscount } from "@/components/pos/checkoutMath";
import type { Branch, CartLine, PaymentMethod, SalePayload } from "@/types/domain";

/** "order": totals and a Pay button under the cart. "pay": the payment screen. */
export type CheckoutStage = "order" | "pay";

/** What the cashier needs to see once a sale is saved. */
export type CompletedSale = {
  method: PaymentMethod;
  total: number;
  changeDue: number;
  /** Server receipt number; null when the sale was queued offline. */
  receiptNo: string | null;
  receipt: ReceiptData;
};

export type POSCheckoutProps = {
  lines: readonly CartLine[];
  branch: Pick<Branch, "id" | "name" | "brand">;
  /** Printed on the receipt. */
  cashierName?: string | null;
  /** Open cash drawer shift; sales are blocked when null. */
  shiftId: string | null;
  stage: CheckoutStage;
  onStageChange: (stage: CheckoutStage) => void;
  /** Called after the sale is saved (synced or queued offline). */
  onSaleComplete: (sale: CompletedSale) => void;
  /** Called per line so the grid can show the new stock right away (offline-friendly). */
  onStockDeducted?: (productId: string, quantity: number) => void;
  /** Card is off by default; enable per branch if a terminal is installed. */
  enabledMethods?: readonly PaymentMethod[];
};

export const METHOD_META: Record<PaymentMethod, { label: string; Icon: typeof Banknote; needsRef: boolean }> = {
  cash: { label: "Cash", Icon: Banknote, needsRef: false },
  gcash: { label: "GCash", Icon: Smartphone, needsRef: true },
  qrph: { label: "QR Ph", Icon: QrCode, needsRef: true },
  card: { label: "Card", Icon: CreditCard, needsRef: false },
};

type DiscountOption = {
  id: string;
  label: string;
  discount: OrderDiscount;
  /** Senior/PWD discounts must log the customer's name and ID (BIR). */
  logType?: "senior" | "pwd";
};

const DISCOUNTS: ReadonlyArray<DiscountOption> = [
  { id: "none", label: "None", discount: { type: "none" } },
  { id: "senior", label: "Senior 20%", discount: { type: "percent", value: 20, label: "Senior 20%" }, logType: "senior" },
  { id: "pwd", label: "PWD 20%", discount: { type: "percent", value: 20, label: "PWD 20%" }, logType: "pwd" },
  { id: "promo10", label: "Promo 10%", discount: { type: "percent", value: 10, label: "Promo 10%" } },
];

/** Big tap target that behaves as one option of a radio group. */
function Choice({
  selected,
  onSelect,
  className,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl border-2 px-2 py-2 text-center text-sm font-bold leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
        selected ? "border-brand bg-brand-light text-brand-dark" : "border-line bg-white text-ink hover:border-brand/50",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function POSCheckout({
  lines,
  branch,
  cashierName,
  shiftId,
  stage,
  onStageChange,
  onSaleComplete,
  onStockDeducted,
  enabledMethods = ["cash", "gcash", "qrph"],
}: POSCheckoutProps) {
  const { t } = useT();
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [tenderedText, setTenderedText] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const [discountId, setDiscountId] = useState("none");
  const [customerName, setCustomerName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const discountLabelId = useId();
  const methodLabelId = useId();

  const option = DISCOUNTS.find((d) => d.id === discountId) ?? DISCOUNTS[0]!;
  const orderDiscount = option.discount;
  const amountTendered = Number.parseFloat(tenderedText) || 0;

  const totals = useMemo(
    () => calculateCheckout({ lines, orderDiscount, paymentMethod: method, amountTendered }),
    [lines, orderDiscount, method, amountTendered],
  );

  const needsRef = METHOD_META[method].needsRef;
  const needsId = Boolean(option.logType);
  const blockedReason =
    !shiftId ? t("Open the cash drawer before selling.")
    : lines.length === 0 ? t("Add at least one item.")
    : needsId && (!customerName.trim() || !idNumber.trim())
      ? t("Enter the customer's name and ID number for the discount.")
    : !totals.isTenderSufficient
      ? amountTendered > 0
        ? t("Cash is short by {amount}.", { amount: formatPeso(totals.shortBy) })
        : t("Enter the cash received, or tap an amount.")
    : needsRef && paymentRef.trim().length < 4 ? t("Enter the reference number from the customer's receipt.")
    : null;

  async function handleCharge(e?: FormEvent) {
    e?.preventDefault();
    if (blockedReason || submitting) return;
    setSubmitting(true);
    setError(null);

    const payload: SalePayload = {
      client_id: newId(),
      branch_id: branch.id,
      shift_id: shiftId,
      payment_method: method,
      amount_tendered: method === "cash" ? amountTendered : totals.total,
      payment_ref: needsRef ? paymentRef.trim() : null,
      discount_total: totals.orderDiscountAmount,
      sold_at: new Date().toISOString(),
      was_offline: !navigator.onLine,
      discount_log: option.logType
        ? { type: option.logType, customer_name: customerName.trim(), id_number: idNumber.trim() }
        : null,
      items: lines.map((l) => ({
        product_id: l.productId,
        quantity: l.quantity,
        unit_price: l.unitPrice,
        line_discount: l.lineDiscount,
      })),
    };

    try {
      const result = await submitSale(payload);
      if (result.status === "rejected") {
        setError(result.message);
        return;
      }
      lines.forEach((l) => onStockDeducted?.(l.productId, l.quantity));
      const receiptNo = result.status === "synced" ? result.transaction.receipt_no : null;
      onSaleComplete({
        method,
        total: totals.total,
        changeDue: totals.changeDue,
        receiptNo,
        receipt: {
          brand: branch.brand,
          branchName: branch.name,
          receiptNo,
          soldAt: payload.sold_at,
          cashierName,
          lines: lines.map((l) => ({
            name: l.name,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            lineTotal: round2(l.quantity * l.unitPrice - l.lineDiscount),
          })),
          subtotal: totals.subtotal,
          discount: totals.orderDiscountAmount,
          discountLabel: payload.discount_log
            ? `${option.label}: ${payload.discount_log.customer_name}, ID ${payload.discount_log.id_number}`
            : totals.orderDiscountAmount > 0 ? option.label : null,
          total: totals.total,
          methodLabel: METHOD_META[method].label,
          tendered: payload.amount_tendered,
          change: totals.changeDue,
          paymentRef: payload.payment_ref,
        },
      });
      setTenderedText("");
      setPaymentRef("");
      setDiscountId("none");
      setCustomerName("");
      setIdNumber("");
      setMethod("cash");
    } finally {
      setSubmitting(false);
    }
  }

  const itemsLabel = t(totals.itemCount === 1 ? "{n} item" : "{n} items", { n: totals.itemCount });

  if (stage === "order") {
    return (
      <div className="space-y-3 border-t border-line bg-surface p-4">
        <dl className="space-y-1">
          <div className="flex justify-between text-sm text-muted">
            <dt>{t("Subtotal ({items})", { items: itemsLabel })}</dt>
            <dd className="tabular-nums">{formatPeso(totals.subtotal)}</dd>
          </div>
          {totals.orderDiscountAmount > 0 && (
            <div className="flex justify-between text-sm font-semibold text-leaf">
              <dt>{t("Discount")}</dt>
              <dd className="tabular-nums">-{formatPeso(totals.orderDiscountAmount)}</dd>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-lg font-bold text-ink">{t("Total")}</dt>
            <dd className="text-4xl font-extrabold tabular-nums text-ink">{formatPeso(totals.total)}</dd>
          </div>
        </dl>
        {!shiftId && <p className="text-sm text-muted">{t("Open the cash drawer before selling.")}</p>}
        <Button size="xl" className="w-full" disabled={!shiftId || lines.length === 0} onClick={() => onStageChange("pay")}>
          {lines.length === 0 ? t("Add items to start") : t("Pay {amount}", { amount: formatPeso(totals.total) })}
        </Button>
      </div>
    );
  }

  const hint = error ?? blockedReason;
  const showChange = !error && method === "cash" && amountTendered > 0 && totals.isTenderSufficient;

  return (
    <form onSubmit={handleCharge} className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <div className="rounded-2xl bg-brand px-4 py-5 text-center text-white">
          <p className="text-sm font-bold text-white/85">{t("Amount to pay")}</p>
          <p className="text-5xl font-extrabold tabular-nums">{formatPeso(totals.total)}</p>
          <p className="mt-1 text-sm font-semibold text-white/85">
            {itemsLabel}
            {totals.orderDiscountAmount > 0 &&
              `, ${t("includes {amount} discount", { amount: formatPeso(totals.orderDiscountAmount) })}`}
          </p>
        </div>

        <div className="space-y-2">
          <p id={discountLabelId} className="font-bold text-ink">{t("Discount")}</p>
          <div role="radiogroup" aria-labelledby={discountLabelId} className="grid grid-cols-2 gap-2">
            {DISCOUNTS.map((d) => (
              <Choice key={d.id} selected={discountId === d.id} onSelect={() => setDiscountId(d.id)}>
                {t(d.label)}
              </Choice>
            ))}
          </div>
          {option.logType && (
            <div className="grid gap-2 rounded-2xl border border-line bg-surface p-3 sm:grid-cols-2">
              <label className="block text-sm font-bold text-ink">
                {t("Customer name")}
                <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} autoComplete="off" className="mt-1" />
              </label>
              <label className="block text-sm font-bold text-ink">
                {t(option.logType === "senior" ? "Senior citizen ID no." : "PWD ID no.")}
                <Input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} autoComplete="off" className="mt-1" />
              </label>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p id={methodLabelId} className="font-bold text-ink">{t("How is the customer paying?")}</p>
          <div role="radiogroup" aria-labelledby={methodLabelId} className="grid grid-cols-3 gap-2">
            {enabledMethods.map((m) => {
              const { label, Icon } = METHOD_META[m];
              return (
                <Choice key={m} selected={method === m} onSelect={() => setMethod(m)} className="min-h-[76px] text-base">
                  <Icon className="h-7 w-7" aria-hidden />
                  {t(label)}
                </Choice>
              );
            })}
          </div>
        </div>

        {method === "cash" ? (
          <div className="space-y-3">
            <label className="block font-bold text-ink">
              {t("Cash received")}
              <span className="relative mt-1 block">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-muted" aria-hidden>
                  ₱
                </span>
                <Input
                  inputMode="decimal"
                  value={tenderedText}
                  onChange={(e) => setTenderedText(e.target.value.replace(/[^\d.]/g, ""))}
                  placeholder="0.00"
                  className="h-16 pl-10 text-3xl font-extrabold tabular-nums"
                />
              </span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {quickCashOptions(totals.total).map((amt) => (
                <Button key={amt} variant="secondary" size="lg" className="px-2 text-base tabular-nums" onClick={() => setTenderedText(String(amt))}>
                  {formatPeso(amt)}
                </Button>
              ))}
            </div>
          </div>
        ) : needsRef ? (
          <label className="block font-bold text-ink">
            {t("{method} reference no.", { method: METHOD_META[method].label })}
            <Input
              value={paymentRef}
              onChange={(e) => setPaymentRef(e.target.value)}
              placeholder={t("From the customer's receipt")}
              className="mt-1 h-14 text-xl"
            />
          </label>
        ) : null}
      </div>

      {/* Pinned footer: the change to give is always visible next to the button. */}
      <div className="space-y-3 border-t border-line bg-surface p-4">
        {showChange ? (
          <div aria-live="polite" className="flex items-center justify-between gap-3 rounded-2xl bg-brand-light px-4 py-2">
            <span className="text-lg font-bold text-brand-dark">{t("Change")}</span>
            <span className="text-3xl font-extrabold tabular-nums text-brand-dark">{formatPeso(totals.changeDue)}</span>
          </div>
        ) : hint ? (
          <p aria-live="polite" className={cn("text-sm font-semibold", error ? "text-danger" : "text-muted")}>
            {hint}
          </p>
        ) : null}
        <Button type="submit" size="xl" className="w-full" disabled={Boolean(blockedReason) || submitting}>
          {submitting ? t("Saving sale...") : t("Complete sale")}
        </Button>
      </div>
    </form>
  );
}
