import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import { useBranch } from "@/context/BranchContext";
import { useT } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { formatQty } from "@/lib/utils";

/**
 * In-app low-stock alert: a bell with the number of items at or below their
 * reorder level in the working branch (or every branch for "All branches").
 */
export function LowStockBell() {
  const { t } = useT();
  const { activeBranch, branches, setActiveBranchId } = useBranch();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const ids = activeBranch ? [activeBranch.id] : branches.map((b) => b.branch.id);
  const names = new Map(branches.map((b) => [b.branch.id, b.branch.name]));

  const low = useQuery({
    queryKey: ["low-stock-bell", ids.join()],
    enabled: ids.length > 0,
    refetchInterval: 120_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_low_stock")
        .select("branch_id, product_id, product_name, unit, quantity, reorder_level")
        .in("branch_id", ids)
        .order("quantity");
      if (error) throw error;
      return data;
    },
  });

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items = low.data ?? [];
  const count = items.length;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`${t("Low stock")}: ${count}`}
        className="relative grid h-10 w-10 place-items-center rounded-xl text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <Bell className="h-5 w-5" aria-hidden />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-gold px-1 text-[11px] font-extrabold text-ink">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-30 w-[min(92vw,360px)] overflow-hidden rounded-2xl border border-line bg-white text-ink shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-extrabold">{t("Low stock")}</p>
            <span className="text-sm font-bold text-muted">{count}</span>
          </div>
          {count === 0 ? (
            <p className="px-4 py-6 text-center text-muted">{t("Nothing is running low.")}</p>
          ) : (
            <ul className="max-h-80 divide-y divide-line overflow-y-auto">
              {items.map((i) => (
                <li key={`${i.branch_id}-${i.product_id}`} className="flex items-center justify-between gap-3 px-4 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-bold">{i.product_name}</p>
                    {!activeBranch && <p className="truncate text-xs text-muted">{names.get(i.branch_id)}</p>}
                  </div>
                  <span className={i.quantity <= 0 ? "shrink-0 text-sm font-extrabold text-danger" : "shrink-0 text-sm font-extrabold text-amber"}>
                    {formatQty(i.quantity, i.unit)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-line p-2">
            <Link
              to="/inventory"
              onClick={() => {
                // From "All branches", jump to the first branch with an alert.
                if (!activeBranch && items[0]) setActiveBranchId(items[0].branch_id);
                setOpen(false);
              }}
              className="block rounded-xl px-3 py-2 text-center text-sm font-bold text-brand hover:bg-brand-light"
            >
              {t("See stock")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
