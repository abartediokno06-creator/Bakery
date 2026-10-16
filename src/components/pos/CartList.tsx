import { Minus, Plus, ShoppingBasket, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { formatPeso, round2 } from "@/lib/utils";
import type { CartLine } from "@/types/domain";

export type CartListProps = {
  lines: readonly CartLine[];
  onQuantityChange: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
};

const STEP =
  "grid h-11 w-11 place-items-center text-ink hover:bg-brand-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand";

export function CartList({ lines, onQuantityChange, onRemove }: CartListProps) {
  const { t } = useT();
  if (lines.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-brand-light text-brand">
          <ShoppingBasket className="h-8 w-8" aria-hidden />
        </span>
        <p className="text-lg font-bold text-ink">{t("No items yet")}</p>
        <p className="text-muted">{t("Tap a product to add it to this order.")}</p>
      </div>
    );
  }

  return (
    <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
      {lines.map((l) => (
        // Controls drop to their own line when the name would get too narrow (phones).
        <li key={l.productId} className="flex flex-wrap items-center gap-2 px-4 py-3">
          <div className="min-w-0 flex-1 basis-24">
            <p className="font-bold leading-snug text-ink">{l.name}</p>
            <p className="text-sm tabular-nums text-muted">{t("{price} each", { price: formatPeso(l.unitPrice) })}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center overflow-hidden rounded-xl border border-line">
              <button
                aria-label={t("Remove one {name}", { name: l.name })}
                onClick={() => onQuantityChange(l.productId, l.quantity - 1)}
                className={STEP}
              >
                <Minus className="h-5 w-5" />
              </button>
              <span className="w-9 text-center text-lg font-extrabold tabular-nums">{l.quantity}</span>
              <button
                aria-label={t("Add one {name}", { name: l.name })}
                onClick={() => onQuantityChange(l.productId, l.quantity + 1)}
                className={STEP}
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
            <span className="min-w-[84px] whitespace-nowrap text-right font-extrabold tabular-nums">
              {formatPeso(round2(l.quantity * l.unitPrice - l.lineDiscount))}
            </span>
            <button
              aria-label={t("Remove {name} from sale", { name: l.name })}
              onClick={() => onRemove(l.productId)}
              className="grid h-11 w-11 place-items-center rounded-xl text-muted hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
