import { Store } from "lucide-react";
import { useBranch } from "@/context/BranchContext";
import { useT } from "@/lib/i18n";
import { useCartStore } from "@/stores/cartStore";

/**
 * Shown when "All branches" is selected on a screen that needs one branch.
 * Big buttons instead of pointing at the dropdown in the header.
 */
export function PickBranch({ purpose }: { purpose: string }) {
  const { branches, setActiveBranchId } = useBranch();
  const clearCart = useCartStore((s) => s.clear);
  const { t } = useT();

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-8">
      <div>
        <h1 className="text-2xl font-extrabold text-ink">{t("Choose a branch")}</h1>
        <p className="text-muted">{purpose}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {branches.map(({ branch }) => (
          <button
            key={branch.id}
            onClick={() => {
              clearCart(); // same rule as the header switcher: no cross-branch sales
              setActiveBranchId(branch.id);
            }}
            className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4 text-left shadow-sm transition-colors hover:border-brand hover:bg-brand-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand text-white">
              <Store className="h-6 w-6" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block font-bold text-ink">{branch.name}</span>
              <span className="block text-sm text-muted">{branch.city}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
