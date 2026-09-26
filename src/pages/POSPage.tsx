import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CartList } from "@/components/pos/CartList";
import { POSCheckout } from "@/components/pos/POSCheckout";
import { ProductGrid, priceOf } from "@/components/pos/ProductGrid";
import { useBranch } from "@/context/BranchContext";
import { useBranchInventory } from "@/hooks/useBranchInventory";
import { useShift } from "@/hooks/useShift";
import { useCartStore } from "@/stores/cartStore";
import { formatPeso, toNumber } from "@/lib/utils";
import { toErrorMessage } from "@/lib/supabase";
import type { Branch } from "@/types/domain";

type Notice = { tone: "good" | "warn" | "bad"; text: string } | null;

export function POSPage() {
  const { activeBranch } = useBranch();
  if (!activeBranch) {
    return <p className="p-8 text-muted">Pick a branch in the top bar to start selling.</p>;
  }
  return <POSForBranch key={activeBranch.id} branch={activeBranch} />;
}

function POSForBranch({ branch }: { branch: Branch }) {
  const inventory = useBranchInventory(branch.id, { kinds: ["finished_good"], sellableOnly: true });
  const { shift, loading: shiftLoading, open } = useShift(branch.id);
  const { lines, add, setQuantity, remove, clear } = useCartStore();
  const [notice, setNotice] = useState<Notice>(null);
  const [float, setFloat] = useState("1000");

  if (!shiftLoading && !shift) {
    return (
      <div className="mx-auto max-w-sm space-y-4 p-8">
        <h1 className="text-2xl font-extrabold">Open the cash drawer</h1>
        <p className="text-muted">Count the starting cash (float) in the drawer for {branch.name}.</p>
        <Input inputMode="decimal" value={float} onChange={(e) => setFloat(e.target.value)} aria-label="Opening float" className="h-12 text-lg" />
        {open.error && <p className="text-sm text-danger">{toErrorMessage(open.error)}</p>}
        <Button size="lg" className="w-full" disabled={open.isPending} onClick={() => open.mutate(toNumber(float))}>
          Open drawer with {formatPeso(toNumber(float))}
        </Button>
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-4 p-4 lg:grid-cols-[1fr_400px]">
      <section className="flex min-h-[50vh] flex-col gap-2 lg:min-h-0">
        <div className="flex flex-wrap items-center gap-2">
          {inventory.fromCache && <Badge tone="warn">Showing saved stock list</Badge>}
          {inventory.realtime === "live" && <Badge tone="good">Stock updates live</Badge>}
          {notice && <Badge tone={notice.tone}>{notice.text}</Badge>}
        </div>
        {inventory.isLoading ? (
          <p className="p-6 text-muted">Loading products...</p>
        ) : (
          <ProductGrid
            items={inventory.items}
            onAdd={(item) => {
              add({ productId: item.product_id, name: item.product.name, unitPrice: priceOf(item) });
              setNotice(null);
            }}
            onUnknownCode={(code) => setNotice({ tone: "bad", text: `No product with code ${code}` })}
          />
        )}
      </section>

      <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-white" aria-label="Current sale">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-bold">Current sale</h2>
          {lines.length > 0 && (
            <button onClick={clear} className="text-sm font-semibold text-muted hover:text-danger">
              Clear sale
            </button>
          )}
        </div>
        <CartList lines={lines} onQuantityChange={setQuantity} onRemove={remove} />
        <POSCheckout
          lines={lines}
          branch={branch}
          shiftId={shift?.id ?? null}
          onStockDeducted={(productId, qty) => {
            // Offline sales never produce a realtime event, so update locally.
            if (!navigator.onLine) inventory.applyLocalDelta(productId, -qty);
          }}
          onSaleComplete={(result, totals) => {
            clear();
            setNotice(
              result.status === "synced"
                ? { tone: "good", text: `Saved ${result.transaction.receipt_no}. Change ${formatPeso(totals.changeDue)}` }
                : { tone: "warn", text: `Saved on this device. Change ${formatPeso(totals.changeDue)}. Uploads when online.` },
            );
          }}
        />
      </aside>
    </div>
  );
}
