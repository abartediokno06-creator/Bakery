import { round2 } from "@/lib/utils";
import type { CartLine, PaymentMethod } from "@/types/domain";

export type OrderDiscount =
  | { type: "none" }
  | { type: "percent"; value: number; label: string }
  | { type: "amount"; value: number; label: string };

export type CheckoutInput = {
  lines: readonly CartLine[];
  orderDiscount: OrderDiscount;
  paymentMethod: PaymentMethod;
  amountTendered: number;
};

export type CheckoutTotals = {
  itemCount: number;
  subtotal: number;
  orderDiscountAmount: number;
  total: number;
  changeDue: number;
  /** Cash only: tendered covers the total. Always true for e-wallet / card. */
  isTenderSufficient: boolean;
  shortBy: number;
};

/**
 * Pure checkout math. Matches process_sale() on the server:
 * line = round(qty * price, 2) - line_discount; total = max(subtotal - order_discount, 0)
 */
export function calculateCheckout(input: CheckoutInput): CheckoutTotals {
  const subtotal = round2(
    input.lines.reduce((sum, l) => sum + round2(l.quantity * l.unitPrice) - l.lineDiscount, 0),
  );

  let orderDiscountAmount = 0;
  if (input.orderDiscount.type === "percent") {
    orderDiscountAmount = round2(subtotal * (input.orderDiscount.value / 100));
  } else if (input.orderDiscount.type === "amount") {
    orderDiscountAmount = round2(Math.min(input.orderDiscount.value, subtotal));
  }

  const total = round2(Math.max(subtotal - orderDiscountAmount, 0));
  const isCash = input.paymentMethod === "cash";
  const isTenderSufficient = !isCash || input.amountTendered >= total;

  return {
    itemCount: input.lines.reduce((n, l) => n + l.quantity, 0),
    subtotal,
    orderDiscountAmount,
    total,
    changeDue: isCash ? round2(Math.max(input.amountTendered - total, 0)) : 0,
    isTenderSufficient,
    shortBy: isCash ? round2(Math.max(total - input.amountTendered, 0)) : 0,
  };
}

/** Quick-cash buttons: exact amount plus common peso bills above the total. */
export function quickCashOptions(total: number): number[] {
  const bills = [20, 50, 100, 200, 500, 1000];
  const options = new Set<number>([Math.ceil(total)]);
  for (const b of bills) {
    const rounded = Math.ceil(total / b) * b;
    if (rounded >= total) options.add(rounded);
  }
  return [...options].sort((a, b) => a - b).slice(0, 5);
}
