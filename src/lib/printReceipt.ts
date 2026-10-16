import { formatPeso } from "@/lib/utils";

/** Everything a printed receipt shows. Built from a finished sale or a saved one. */
export type ReceiptData = {
  brand: string;
  branchName: string;
  /** Null when the sale was saved offline and has no number yet. */
  receiptNo: string | null;
  soldAt: string;
  cashierName?: string | null;
  lines: ReadonlyArray<{ name: string; quantity: number; unitPrice: number; lineTotal: number }>;
  subtotal: number;
  discount: number;
  /** e.g. "Senior 20%: Juan Dela Cruz, ID OSCA-123" */
  discountLabel?: string | null;
  total: number;
  methodLabel: string;
  tendered: number;
  change: number;
  paymentRef?: string | null;
  voided?: boolean;
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

const row = (left: string, right: string, cls = "") =>
  `<div class="row ${cls}"><span>${esc(left)}</span><span>${esc(right)}</span></div>`;

function receiptHtml(r: ReceiptData): string {
  const when = new Date(r.soldAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
  const items = r.lines
    .map(
      (l) =>
        `<div class="item">${esc(l.name)}</div>` +
        row(`  ${l.quantity} x ${formatPeso(l.unitPrice)}`, formatPeso(l.lineTotal)),
    )
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt</title><style>
    @page { margin: 2mm; }
    * { box-sizing: border-box; }
    body { margin: 0; width: 48mm; font: 12px/1.35 "Courier New", monospace; color: #000; }
    h1 { margin: 0; font-size: 16px; text-align: center; }
    .c { text-align: center; }
    .small { font-size: 11px; }
    .row { display: flex; justify-content: space-between; gap: 6px; }
    .row span:last-child { white-space: nowrap; }
    .item { margin-top: 2px; }
    .total { font-size: 15px; font-weight: bold; }
    .void { margin: 4px 0; padding: 2px; border: 2px solid #000; text-align: center; font-weight: bold; }
    hr { border: 0; border-top: 1px dashed #000; margin: 5px 0; }
  </style></head><body>
    <h1>${esc(r.brand)} Bakery</h1>
    <div class="c small">${esc(r.branchName)}</div>
    <hr>
    ${r.voided ? '<div class="void">VOIDED</div>' : ""}
    ${row("Receipt", r.receiptNo ?? "Pending upload", "small")}
    ${row("Date", when, "small")}
    ${r.cashierName ? row("Cashier", r.cashierName, "small") : ""}
    <hr>
    ${items}
    <hr>
    ${row("Subtotal", formatPeso(r.subtotal))}
    ${r.discount > 0 ? row("Discount", `-${formatPeso(r.discount)}`) : ""}
    ${r.discountLabel ? `<div class="small">${esc(r.discountLabel)}</div>` : ""}
    ${row("TOTAL", formatPeso(r.total), "total")}
    ${row(r.methodLabel, formatPeso(r.tendered))}
    ${r.change > 0 ? row("Change", formatPeso(r.change)) : ""}
    ${r.paymentRef ? row("Ref no.", r.paymentRef, "small") : ""}
    <hr>
    <div class="c">Thank you! Salamat po!</div>
    <div class="c small">This is not an official receipt.</div>
  </body></html>`;
}

/**
 * Prints on the default printer (a 58 mm thermal printer in the branches)
 * through a hidden iframe, so the app page itself is never printed.
 */
export function printReceipt(r: ReceiptData): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);

  const win = frame.contentWindow;
  const doc = frame.contentDocument;
  if (!win || !doc) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(receiptHtml(r));
  doc.close();

  let removed = false;
  const cleanup = () => {
    if (removed) return;
    removed = true;
    frame.remove();
  };
  win.addEventListener("afterprint", () => setTimeout(cleanup, 100));
  setTimeout(() => {
    win.focus();
    win.print();
    // Some browsers never fire afterprint; don't leave the frame behind.
    setTimeout(cleanup, 60_000);
  }, 50);
}
