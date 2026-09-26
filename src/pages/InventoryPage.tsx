import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useBranch } from "@/context/BranchContext";
import { useBranchInventory } from "@/hooks/useBranchInventory";
import { supabase, toErrorMessage } from "@/lib/supabase";
import { cn, formatQty, toNumber } from "@/lib/utils";
import type { Enums } from "@/types/database.types";

const KIND_LABEL: Record<Enums<"item_kind">, string> = {
  finished_good: "Baked goods",
  ingredient: "Ingredients",
  packaging: "Packaging",
};

export function InventoryPage() {
  const { activeBranch, can } = useBranch();
  const branchId = activeBranch?.id ?? null;
  const [kind, setKind] = useState<Enums<"item_kind">>("finished_good");
  const inv = useBranchInventory(branchId, { kinds: [kind] });

  if (!activeBranch) return <p className="p-8 text-muted">Pick a branch in the top bar to see its stock.</p>;

  return (
    <div className="grid gap-4 p-4 xl:grid-cols-[1fr_360px]">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>{activeBranch.name} stock</CardTitle>
          <div className="flex items-center gap-2">
            <Badge tone={inv.realtime === "live" ? "good" : "warn"}>
              {inv.realtime === "live" ? "Live" : inv.realtime === "offline" ? "Offline" : "Connecting"}
            </Badge>
            {inv.lowStock.length > 0 && <Badge tone="bad">{inv.lowStock.length} low</Badge>}
          </div>
        </CardHeader>
        <div className="flex gap-2 border-b border-line px-4 py-2" role="tablist">
          {(Object.keys(KIND_LABEL) as Array<Enums<"item_kind">>).map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className={cn("rounded-full px-3 py-1 text-sm font-semibold", kind === k ? "bg-ink text-white" : "text-muted hover:bg-surface")}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="px-4 py-2 font-semibold">Item</th>
                <th className="px-4 py-2 font-semibold">SKU</th>
                <th className="px-4 py-2 text-right font-semibold">On hand</th>
                <th className="px-4 py-2 text-right font-semibold">Reorder at</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {inv.items.map((i) => (
                <tr key={i.id} className={i.quantity <= i.reorder_level ? "bg-danger/5" : undefined}>
                  <td className="px-4 py-2 font-semibold">{i.product.name}</td>
                  <td className="px-4 py-2 text-muted">{i.product.sku}</td>
                  <td className={cn("px-4 py-2 text-right tabular-nums font-bold", i.quantity <= i.reorder_level && "text-danger")}>
                    {formatQty(i.quantity, i.product.unit)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted">{formatQty(i.reorder_level, i.product.unit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="space-y-4">
        {can("production.record") && <ProductionForm branchId={activeBranch.id} />}
        {can("inventory.adjust") && (
          <AdjustForm branchId={activeBranch.id} options={inv.items.map((i) => ({ id: i.product_id, name: i.product.name }))} />
        )}
      </div>
    </div>
  );
}

function ProductionForm({ branchId }: { branchId: string }) {
  const [recipeId, setRecipeId] = useState("");
  const [batches, setBatches] = useState("1");
  const recipes = useQuery({
    queryKey: ["recipes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("recipes").select("id, name, yield_qty").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });
  const record = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("record_production", {
        p_branch_id: branchId,
        p_recipe_id: recipeId,
        p_batches: toNumber(batches),
      });
      if (error) throw error;
      return data;
    },
  });

  return (
    <Card>
      <CardHeader><CardTitle>Record a bake</CardTitle></CardHeader>
      <CardBody className="space-y-3">
        <p className="text-sm text-muted">Ingredients are deducted and baked goods are added automatically.</p>
        <select value={recipeId} onChange={(e) => setRecipeId(e.target.value)} className="h-11 w-full rounded-lg border border-line bg-white px-3" aria-label="Recipe">
          <option value="">Choose recipe</option>
          {recipes.data?.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        <Input inputMode="decimal" value={batches} onChange={(e) => setBatches(e.target.value)} aria-label="Batches" placeholder="Batches" />
        <Button className="w-full" disabled={!recipeId || toNumber(batches) <= 0 || record.isPending} onClick={() => record.mutate()}>
          Record bake
        </Button>
        {record.isSuccess && <p className="text-sm text-leaf">Recorded {record.data.output_qty} pcs.</p>}
        {record.error && <p className="text-sm text-danger">{toErrorMessage(record.error)}</p>}
      </CardBody>
    </Card>
  );
}

function AdjustForm({ branchId, options }: { branchId: string; options: Array<{ id: string; name: string }> }) {
  const [productId, setProductId] = useState("");
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState<"adjustment" | "spoilage">("spoilage");
  const [note, setNote] = useState("");
  const adjust = useMutation({
    mutationFn: async () => {
      const qty = toNumber(delta);
      const { error } = await supabase.rpc("adjust_stock", {
        p_branch_id: branchId,
        p_product_id: productId,
        p_delta: reason === "spoilage" ? -Math.abs(qty) : qty,
        p_reason: reason,
        p_note: note || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setDelta("");
      setNote("");
    },
  });

  return (
    <Card>
      <CardHeader><CardTitle>Adjust stock</CardTitle></CardHeader>
      <CardBody className="space-y-3">
        <select value={productId} onChange={(e) => setProductId(e.target.value)} className="h-11 w-full rounded-lg border border-line bg-white px-3" aria-label="Item">
          <option value="">Choose item</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <select value={reason} onChange={(e) => setReason(e.target.value as typeof reason)} className="h-11 w-full rounded-lg border border-line bg-white px-3" aria-label="Reason">
          <option value="spoilage">Spoilage / unsold (removes stock)</option>
          <option value="adjustment">Count correction (+ or -)</option>
        </select>
        <Input inputMode="decimal" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="Quantity" aria-label="Quantity" />
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" aria-label="Note" />
        <Button className="w-full" disabled={!productId || toNumber(delta) === 0 || adjust.isPending} onClick={() => adjust.mutate()}>
          Save adjustment
        </Button>
        {adjust.error && <p className="text-sm text-danger">{toErrorMessage(adjust.error)}</p>}
      </CardBody>
    </Card>
  );
}
