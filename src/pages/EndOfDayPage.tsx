import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PickBranch } from "@/components/layout/PickBranch";
import { useBranch } from "@/context/BranchContext";
import { useBranchInventory } from "@/hooks/useBranchInventory";
import { useT } from "@/lib/i18n";
import { supabase, toErrorMessage } from "@/lib/supabase";
import { formatQty, toNumber } from "@/lib/utils";
import type { Branch } from "@/types/domain";

export function EndOfDayPage() {
  const { t } = useT();
  const { activeBranch } = useBranch();
  if (!activeBranch) return <PickBranch purpose={t("End-of-day leftovers")} />;
  return <Leftovers key={activeBranch.id} branch={activeBranch} />;
}

/**
 * Closing routine: unsold baked goods that won't be sold tomorrow are
 * removed from stock as spoilage, which feeds the waste report.
 */
function Leftovers({ branch }: { branch: Branch }) {
  const { t } = useT();
  const { can } = useBranch();
  const inv = useBranchInventory(branch.id, { kinds: ["finished_good"], sellableOnly: true });
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<number | null>(null);

  const entries = Object.entries(counts)
    .map(([product_id, v]) => ({ product_id, qty: toNumber(v) }))
    .filter((e) => e.qty > 0);

  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("record_leftovers", {
        p_branch_id: branch.id,
        p_items: entries,
        p_note: "End-of-day leftovers",
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (n) => {
      setSaved(n);
      setCounts({});
    },
  });

  if (!can("leftovers.record")) {
    return <p className="p-8 text-muted">{t("Only cashiers, managers, or the owner can record leftovers.")}</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-light text-brand">
          <Moon className="h-6 w-6" aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold text-ink">{t("End-of-day leftovers")}</h1>
          <p className="text-muted">
            {t(
              "Count unsold items you will throw away or won't sell tomorrow. They are removed from stock and counted as waste.",
            )}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{branch.name}</CardTitle>
        </CardHeader>
        {inv.isLoading ? (
          <CardBody className="text-muted">{t("Loading products...")}</CardBody>
        ) : (
          <ul className="divide-y divide-line">
            <li className="grid grid-cols-[1fr_90px_110px] gap-3 px-4 py-2 text-xs font-bold uppercase tracking-wide text-muted">
              <span>{t("Products")}</span>
              <span className="text-right">{t("In stock")}</span>
              <span className="text-right">{t("Throw away")}</span>
            </li>
            {inv.items.map((i) => (
              <li key={i.id} className="grid grid-cols-[1fr_90px_110px] items-center gap-3 px-4 py-2">
                <label htmlFor={`left-${i.product_id}`} className="font-bold text-ink">
                  {i.product.name}
                </label>
                <span className="text-right tabular-nums text-muted">{formatQty(i.quantity, i.product.unit)}</span>
                <Input
                  id={`left-${i.product_id}`}
                  inputMode="numeric"
                  placeholder="0"
                  value={counts[i.product_id] ?? ""}
                  onChange={(e) => {
                    setSaved(null);
                    setCounts((c) => ({ ...c, [i.product_id]: e.target.value.replace(/[^\d.]/g, "") }));
                  }}
                  className="h-11 text-right text-lg font-bold tabular-nums"
                />
              </li>
            ))}
          </ul>
        )}
        <CardBody className="space-y-2 border-t border-line">
          {save.error && <p role="alert" className="text-sm text-danger">{toErrorMessage(save.error)}</p>}
          {saved !== null && (
            <p role="status" className="text-sm font-bold text-leaf">
              {t("Saved {n} item(s) as leftovers.", { n: saved })}
            </p>
          )}
          <Button size="xl" className="w-full" disabled={entries.length === 0 || save.isPending} onClick={() => save.mutate()}>
            {t("Save leftovers")}
          </Button>
          {entries.length === 0 && saved === null && (
            <p className="text-center text-sm text-muted">{t("Nothing to save. Enter at least one quantity.")}</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
