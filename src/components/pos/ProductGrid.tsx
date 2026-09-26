import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn, formatPeso } from "@/lib/utils";
import type { InventoryItem } from "@/types/domain";

export type ProductGridProps = {
  items: readonly InventoryItem[];
  onAdd: (item: InventoryItem) => void;
  /** Called when a scanned/typed code matches nothing. */
  onUnknownCode?: (code: string) => void;
};

const ALL = "All";

/** Effective selling price for a branch (override wins). */
export const priceOf = (i: InventoryItem): number => i.price_override ?? i.product.price;

export function ProductGrid({ items, onAdd, onUnknownCode }: ProductGridProps) {
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
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden />
        <Input
          ref={inputRef}
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search or scan barcode"
          aria-label="Search products or scan barcode"
          className="h-12 pl-10 text-lg"
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
              "h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ube",
              category === c ? "bg-ink text-white" : "bg-white text-ink border border-line hover:bg-ube-light",
            )}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 xl:grid-cols-4">
        {visible.map((item) => {
          const out = item.quantity <= 0;
          const low = !out && item.quantity <= item.reorder_level;
          return (
            <button
              key={item.id}
              onClick={() => onAdd(item)}
              className={cn(
                "group flex min-h-[112px] flex-col justify-between rounded-tile border bg-white p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ube active:bg-ube-light",
                out ? "border-danger/40" : "border-line hover:border-ube",
              )}
            >
              <span className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink">
                {item.product.name}
              </span>
              <span className="mt-2 flex items-end justify-between gap-2">
                <span className="text-lg font-extrabold tabular-nums text-ube-dark">
                  {formatPeso(priceOf(item))}
                </span>
                <span
                  className={cn(
                    "text-xs font-semibold tabular-nums",
                    out ? "text-danger" : low ? "text-amber" : "text-muted",
                  )}
                >
                  {out ? "Out" : `${item.quantity} left`}
                </span>
              </span>
            </button>
          );
        })}
        {visible.length === 0 && (
          <p className="col-span-full py-10 text-center text-muted">
            No products match "{search}". Check the spelling or scan again.
          </p>
        )}
      </div>
    </div>
  );
}
