import { Store } from "lucide-react";
import { useBranch } from "@/context/BranchContext";
import { useCartStore } from "@/stores/cartStore";

const ROLE_LABEL = {
  super_admin: "Owner",
  branch_manager: "Manager",
  cashier: "Cashier",
  baker: "Baker",
} as const;

/** Lets multi-branch users change the working branch. Clears the cart to avoid cross-branch sales. */
export function BranchSwitcher() {
  const { branches, activeBranch, activeRole, isSuperAdmin, setActiveBranchId } = useBranch();
  const clearCart = useCartStore((s) => s.clear);

  if (branches.length === 0) return null;

  // Group by brand so 10 branches stay scannable.
  const byBrand = branches.reduce<Record<string, typeof branches>>((acc, b) => {
    (acc[b.branch.brand] ??= []).push(b);
    return acc;
  }, {});

  const single = branches.length === 1 && !isSuperAdmin;

  return (
    <div className="flex items-center gap-2">
      <Store className="h-5 w-5 shrink-0 text-ube" aria-hidden />
      {single ? (
        <span className="font-semibold text-ink">{activeBranch?.name}</span>
      ) : (
        <select
          aria-label="Working branch"
          value={activeBranch?.id ?? "all"}
          onChange={(e) => {
            clearCart();
            setActiveBranchId(e.target.value === "all" ? null : e.target.value);
          }}
          className="h-10 max-w-[240px] rounded-lg border border-line bg-white px-2 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ube"
        >
          {isSuperAdmin && <option value="all">All branches</option>}
          {Object.entries(byBrand).map(([brand, list]) => (
            <optgroup key={brand} label={brand}>
              {list.map(({ branch }) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      )}
      {activeRole && (
        <span className="hidden rounded-full bg-ube-light px-2 py-0.5 text-xs font-semibold text-ube-dark sm:inline">
          {ROLE_LABEL[activeRole]}
        </span>
      )}
    </div>
  );
}
