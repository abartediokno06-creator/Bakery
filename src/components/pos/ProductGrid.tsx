import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { CakeSlice, Coffee, Cookie, Croissant, Sandwich, Search, Wheat, type LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n";
import { cn, formatPeso } from "@/lib/utils";
import type { InventoryItem } from "@/types/domain";

export type ProductGridProps = {
  items: readonly InventoryItem[];
  /** Quantity of each product already in the order, keyed by product id. */
  inCart?: ReadonlyMap<string, number>;
  onAdd: (item: InventoryItem) => void;
  /** Called when a scanned/typed code matches nothing. */
  onUnknownCode?: (code: string) => void;
};

const ALL = "All";

/** Picture per category so cashiers can find items without reading every name. */
const CATEGORY_ICON: Record<string, LucideIcon> = {
  Bread: Croissant,
  Loaf: Sandwich,
  Cakes: CakeSlice,
  Pastry: Cookie,
  Drinks: Coffee,
};

/** Effective selling price for a branch (override wins). */
export const priceOf = (i: InventoryItem): number => i.price_override ?? i.product.price;

export function ProductGrid({ items, inCart, onAdd, onUnknownCode }: ProductGridProps) {
  const { t } = useT();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL);
  const inputRef = useRef<HTMLInputElement>(null);

  const categories = useMemo(
    () => [ALL, ...new Set(items.map((i) => i.product.category))],
    [items],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(
      (i) =>
        (category === ALL || i.product.category === category) &&
        (!q ||
          i.product.name.toLowerCase().includes(q) ||
          i.product.sku.toLowerCase().includes(q) ||
          i.product.barcode === q),
    );
  }, [items, search, category]);

  // USB/Bluetooth barcode scanners type the code then press Enter.
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const code = search.trim();
    if (!code) return;
    const exact = items.find(
      (i) => i.product.barcode === code || i.product.sku.toLowerCase() === code.toLowerCase(),
    );
    if (exact) onAdd(exact);
    else if (visible.length === 1 && visible[0]) onAdd(visible[0]);
    else onUnknownCode?.(code);
    setSearch("");
    inputRef.current?.focus();
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden />
        <Input
          ref={inputRef}
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t("Search item or scan barcode")}
          aria-label="Search products or scan barcode"
          className="h-14 rounded-2xl pl-12 text-lg"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Categories">
        {categories.map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={category === c}
            onClick={() => setCategory(c)}
            className={cn(
              "h-12 shrink-0 rounded-full px-5 text-base font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
              category === c ? "bg-brand text-white" : "border border-line bg-white text-ink hover:border-brand hover:bg-brand-light",
            )}
          >
            {c === ALL ? t("All") : c}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto p-1 sm:grid-cols-3 xl:grid-cols-4">
        {visible.map((item) => {
          const out = item.quantity <= 0;
          const low = !out && item.quantity <= item.reorder_level;
          const qty = inCart?.get(item.product_id) ?? 0;
          const Icon = CATEGORY_ICON[item.product.category] ?? Wheat;
          return (
            <button
              key={item.id}
              onClick={() => onAdd(item)}
              className={cn(
                "relative flex min-h-[152px] flex-col rounded-tile border-2 bg-white p-3 text-left shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 active:scale-[0.97] motion-reduce:transform-none",
                qty > 0 ? "border-brand" : "border-line hover:border-brand/50",
              )}
            >
              {qty > 0 && (
                <span className="absolute right-2 top-2 grid h-8 min-w-[2rem] place-items-center rounded-full bg-brand px-2 text-sm font-extrabold tabular-nums text-white">
                  {qty}
                  <span className="sr-only"> {t("in this order")}</span>
                </span>
              )}
              <span
                className={cn(
                  "grid h-12 w-12 place-items-center overflow-hidden rounded-xl",
                  out ? "bg-surface text-muted" : "bg-brand-light text-brand",
                )}
              >
                {item.product.image_url ? (
                  <img src={item.product.image_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Icon className="h-6 w-6" aria-hidden />
                )}
              </span>
              <span className="mt-2 line-clamp-2 text-base font-bold leading-snug text-ink">
                {item.product.name}
              </span>
              <span className="mt-auto flex flex-wrap items-end justify-between gap-x-2 gap-y-1 pt-2">
                <span className={cn("text-xl font-extrabold tabular-nums", out ? "text-muted" : "text-brand")}>
                  {formatPeso(priceOf(item))}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-bold tabular-nums",
                    out ? "bg-danger/10 text-danger" : low ? "bg-amber/10 text-amber" : "text-muted",
                  )}
                >
                  {out ? t("Sold out") : t(low ? "Only {n} left" : "{n} left", { n: item.quantity })}
                </span>
              </span>
            </button>
          );
        })}
        {visible.length === 0 && (
          <p className="col-span-full py-10 text-center text-muted">
            {t('No products match "{q}". Check the spelling or scan again.', { q: search })}
          </p>
        )}
      </div>
    </div>
  );
}
