import { Minus, Plus, Trash2 } from "lucide-react";
import { formatPeso, round2 } from "@/lib/utils";
import type { CartLine } from "@/types/domain";

export type CartListProps = {
  lines: readonly CartLine[];
  onQuantityChange: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
};

export function CartList({ lines, onQuantityChange, onRemove }: CartListProps) {
  if (lines.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-muted">
        Tap a product or scan a barcode to start a sale.
      </div>
    );
  }

  return (
    <ul className="flex-1 divide-y divide-line overflow-y-auto">
      {lines.map((l) => (
        <li key={l.productId} className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-ink">{l.name}</p>
            <p className="text-sm tabular-nums text-muted">{formatPeso(l.unitPrice)} each</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              aria-label={`Remove one ${l.name}`}
              onClick={() => onQuantityChange(l.productId, l.quantity - 1)}
              className="grid h-10 w-10 place-items-center rounded-lg border border-line hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ube"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-9 text-center text-lg font-bold tabular-nums">{l.quantity}</span>
            <button
              aria-label={`Add one ${l.name}`}
              onClick={() => onQuantityChange(l.productId, l.quantity + 1)}
              className="grid h-10 w-10 place-items-center rounded-lg border border-line hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ube"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <span className="w-20 text-right font-bold tabular-nums">
            {formatPeso(round2(l.quantity * l.unitPrice - l.lineDiscount))}
          </span>
          <button
            aria-label={`Remove ${l.name} from sale`}
            onClick={() => onRemove(l.productId)}
            className="grid h-10 w-10 place-items-center rounded-lg text-muted hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ube"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}
