import { useMemo, useState } from "react";
import { Banknote, CreditCard, QrCode, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatPeso, newId } from "@/lib/utils";
import { submitSale, type SubmitSaleResult } from "@/stores/syncStore";
import {
  calculateCheckout,
  quickCashOptions,
  type CheckoutTotals,
  type OrderDiscount,
} from "@/components/pos/checkoutMath";
import type { Branch, CartLine, PaymentMethod, SalePayload } from "@/types/domain";

export type POSCheckoutProps = {
  lines: readonly CartLine[];
  branch: Pick<Branch, "id" | "name">;
  /** Open cash drawer shift; sales are blocked when null. */
  shiftId: string | null;
  /** Called after the sale is saved (synced or queued offline). */
  onSaleComplete: (result: Exclude<SubmitSaleResult, { status: "rejected" }>, totals: CheckoutTotals) => void;
  /** Called per line so the grid can show the new stock right away (offline-friendly). */
  onStockDeducted?: (productId: string, quantity: number) => void;
  /** Card is off by default; enable per branch if a terminal is installed. */
  enabledMethods?: readonly PaymentMethod[];
};

const METHOD_META: Record<PaymentMethod, { label: string; Icon: typeof Banknote; needsRef: boolean }> = {
  cash: { label: "Cash", Icon: Banknote, needsRef: false },
  gcash: { label: "GCash", Icon: Smartphone, needsRef: true },
  qrph: { label: "QR Ph", Icon: QrCode, needsRef: true },
  card: { label: "Card", Icon: CreditCard, needsRef: false },
};

const DISCOUNTS: ReadonlyArray<{ id: string; discount: OrderDiscount }> = [
  { id: "none", discount: { type: "none" } },
  { id: "senior", discount: { type: "percent", value: 20, label: "Senior / PWD 20%" } },
  { id: "promo10", discount: { type: "percent", value: 10, label: "Promo 10%" } },
];

export function POSCheckout({
  lines,
  branch,
  shiftId,
  onSaleComplete,
  onStockDeducted,
  enabledMethods = ["cash", "gcash", "qrph"],
}: POSCheckoutProps) {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [tenderedText, setTenderedText] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const [discountId, setDiscountId] = useState("none");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orderDiscount = DISCOUNTS.find((d) => d.id === discountId)?.discount ?? { type: "none" };
  const amountTendered = Number.parseFloat(tenderedText) || 0;

  const totals = useMemo(
    () => calculateCheckout({ lines, orderDiscount, paymentMethod: method, amountTendered }),
    [lines, orderDiscount, method, amountTendered],
  );

  const needsRef = METHOD_META[method].needsRef;
  const blockedReason =
    !shiftId ? "Open the cash drawer before selling."
    : lines.length === 0 ? "Add at least one item."
    : !totals.isTenderSufficient ? `Cash is short by ${formatPeso(totals.shortBy)}.`
    : needsRef && paymentRef.trim().length < 4 ? "Enter the reference number from the customer's receipt."
    : null;

  async function handleCharge() {
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
      onSaleComplete(result, totals);
      setTenderedText("");
      setPaymentRef("");
      setDiscountId("none");
      setMethod("cash");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4 border-t border-line p-4">
      {/* Totals */}
      <dl className="space-y-1 text-sm">
        <div className="flex justify-between text-muted">
          <dt>Subtotal ({totals.itemCount} items)</dt>
          <dd className="tabular-nums">{formatPeso(totals.subtotal)}</dd>
        </div>
        {totals.orderDiscountAmount > 0 && (
          <div className="flex justify-between text-leaf">
            <dt>Discount</dt>
            <dd className="tabular-nums">-{formatPeso(totals.orderDiscountAmount)}</dd>
          </div>
        )}
        <div className="flex items-baseline justify-between pt-1">
          <dt className="text-base font-bold text-ink">Total</dt>
          <dd className="text-3xl font-extrabold tabular-nums text-ink">{formatPeso(totals.total)}</dd>
        </div>
      </dl>

      {/* Discount */}
      <label className="block text-sm font-semibold text-ink">
        Discount
        <select
          value={discountId}
          onChange={(e) => setDiscountId(e.target.value)}
          className="mt-1 h-11 w-full rounded-lg border border-line bg-white px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ube"
        >
          {DISCOUNTS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.discount.type === "none" ? "No discount" : d.discount.label}
            </option>
          ))}
        </select>
      </label>

      {/* Payment method */}
      <div role="radiogroup" aria-label="Payment method" className="grid grid-cols-3 gap-2">
        {enabledMethods.map((m) => {
          const { label, Icon } = METHOD_META[m];
          return (
            <button
              key={m}
              role="radio"
              aria-checked={method === m}
              onClick={() => setMethod(m)}
              className={cn(
                "flex h-14 flex-col items-center justify-center gap-0.5 rounded-lg border text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ube",
                method === m ? "border-ube bg-ube-light text-ube-dark" : "border-line bg-white text-ink hover:bg-surface",
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
              {label}
            </button>
          );
        })}
      </div>

      {method === "cash" ? (
        <div className="space-y-2">
          <Input
            inputMode="decimal"
            value={tenderedText}
            onChange={(e) => setTenderedText(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="Cash received"
            aria-label="Cash received"
            className="h-12 text-lg tabular-nums"
          />
          <div className="flex flex-wrap gap-2">
            {quickCashOptions(totals.total).map((amt) => (
              <button
                key={amt}
                onClick={() => setTenderedText(String(amt))}
                className="h-10 rounded-lg border border-line bg-white px-3 text-sm font-semibold tabular-nums hover:bg-ube-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ube"
              >
                {formatPeso(amt)}
              </button>
            ))}
          </div>
          {amountTendered > 0 && totals.isTenderSufficient && (
            <p className="text-lg font-bold text-leaf tabular-nums">Change: {formatPeso(totals.changeDue)}</p>
          )}
        </div>
      ) : needsRef ? (
        <Input
          value={paymentRef}
          onChange={(e) => setPaymentRef(e.target.value)}
          placeholder={`${METHOD_META[method].label} reference no.`}
          aria-label="Payment reference number"
          className="h-12 text-lg"
        />
      ) : null}

      {(error ?? blockedReason) && (
        <p role="alert" className={cn("text-sm font-medium", error ? "text-danger" : "text-muted")}>
          {error ?? blockedReason}
        </p>
      )}

      <Button size="lg" className="w-full" disabled={Boolean(blockedReason) || submitting} onClick={handleCharge}>
        {submitting ? "Saving sale..." : `Charge ${formatPeso(totals.total)}`}
      </Button>
    </div>
  );
}
