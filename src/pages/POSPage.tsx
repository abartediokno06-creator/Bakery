import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, BarChart3, Package, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PickBranch } from "@/components/layout/PickBranch";
import { CartList } from "@/components/pos/CartList";
import { POSCheckout, type CheckoutStage, type CompletedSale } from "@/components/pos/POSCheckout";
import { ProductGrid, priceOf } from "@/components/pos/ProductGrid";
import { SaleComplete } from "@/components/pos/SaleComplete";
import { useBranch } from "@/context/BranchContext";
import { useBranchInventory } from "@/hooks/useBranchInventory";
import { useShift } from "@/hooks/useShift";
import { useT } from "@/lib/i18n";
import { useCartStore } from "@/stores/cartStore";
import { formatPeso, toNumber } from "@/lib/utils";
import { toErrorMessage } from "@/lib/supabase";
import type { Branch, InventoryItem } from "@/types/domain";

export function POSPage() {
  const { activeBranch } = useBranch();
  const { t } = useT();
  if (!activeBranch) return <PickBranch purpose={t("Pick the branch you are selling for.")} />;
  return <POSForBranch key={activeBranch.id} branch={activeBranch} />;
}

/**
 * Selling flow, one step at a time:
 * 1. tap products ("order")  2. Pay: discount, method, cash ("pay")  3. change to give (lastSale)
 */
function POSForBranch({ branch }: { branch: Branch }) {
  const { t } = useT();
  const { profile } = useBranch();
  const inventory = useBranchInventory(branch.id, { kinds: ["finished_good"], sellableOnly: true });
  const { shift, loading: shiftLoading, open } = useShift(branch.id);
  const { lines, add, setQuantity, remove, clear } = useCartStore();
  const [stage, setStage] = useState<CheckoutStage>("order");
  const [lastSale, setLastSale] = useState<CompletedSale | null>(null);
  const [unknownCode, setUnknownCode] = useState<string | null>(null);

  const inCart = useMemo(() => new Map(lines.map((l) => [l.productId, l.quantity])), [lines]);

  if (!shiftLoading && !shift) {
    return (
      <OpenDrawer
        branch={branch}
        pending={open.isPending}
        error={open.error}
        onOpen={(amount) => open.mutate(amount)}
      />
    );
  }

  // An empty order can't be paid for, so fall back to the order step.
  const view: CheckoutStage = lines.length === 0 ? "order" : stage;

  const addItem = (item: InventoryItem) => {
    add({ productId: item.product_id, name: item.product.name, unitPrice: priceOf(item) });
    setUnknownCode(null);
    if (lastSale) {
      // Tapping a product after a sale starts the next one.
      setLastSale(null);
      setStage("order");
    }
  };

  const clearOrder = () => {
    if (window.confirm(t("Remove all items from this order?"))) clear();
  };

  return (
    // Desktop: products and order side by side, each scrolling on its own.
    // Phone: products in a fixed-height scroller, the order panel grows below it.
    <div className="grid grid-cols-1 gap-4 p-3 sm:p-4 lg:h-full lg:min-h-0 lg:grid-cols-[1fr_420px]">
      <section aria-label={t("Products")} className="flex h-[62vh] min-h-[360px] flex-col gap-3 lg:h-auto lg:min-h-0">
        {(inventory.fromCache || unknownCode) && (
          <div className="flex flex-wrap items-center gap-2">
            {inventory.fromCache && <Badge tone="warn">{t("Offline: showing the last saved stock list")}</Badge>}
            {unknownCode && <Badge tone="bad">{t("No product with code {code}", { code: unknownCode })}</Badge>}
          </div>
        )}
        {inventory.isLoading ? (
          <p className="p-6 text-muted">{t("Loading products...")}</p>
        ) : (
          <ProductGrid items={inventory.items} inCart={inCart} onAdd={addItem} onUnknownCode={setUnknownCode} />
        )}
      </section>

      <aside
        aria-label={t("Current order")}
        className="flex min-h-[420px] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-sm lg:min-h-0"
      >
        {lastSale ? (
          <SaleComplete
            sale={lastSale}
            onNewSale={() => {
              setLastSale(null);
              setStage("order");
            }}
          />
        ) : (
          <>
            <div className="flex min-h-[64px] items-center justify-between gap-2 border-b border-line px-4 py-2">
              {view === "pay" ? (
                <>
                  <h2 className="text-lg font-extrabold text-ink">{t("Payment")}</h2>
                  <Button variant="ghost" size="sm" onClick={() => setStage("order")}>
                    <ArrowLeft className="h-4 w-4" aria-hidden /> {t("Back to order")}
                  </Button>
                </>
              ) : (
                <>
                  <h2 className="text-lg font-extrabold text-ink">{t("Current order")}</h2>
                  {lines.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={clearOrder} className="text-muted hover:bg-danger/10 hover:text-danger">
                      {t("Clear all")}
                    </Button>
                  )}
                </>
              )}
            </div>
            {view === "order" && <CartList lines={lines} onQuantityChange={setQuantity} onRemove={remove} />}
            <POSCheckout
              lines={lines}
              branch={branch}
              cashierName={profile?.full_name ?? null}
              shiftId={shift?.id ?? null}
              stage={view}
              onStageChange={setStage}
              onStockDeducted={(productId, qty) => {
                // Offline sales never produce a realtime event, so update locally.
                if (!navigator.onLine) inventory.applyLocalDelta(productId, -qty);
              }}
              onSaleComplete={(sale) => {
                clear();
                setLastSale(sale);
                setStage("order");
              }}
            />
          </>
        )}
      </aside>
    </div>
  );
}

function OpenDrawer({
  branch,
  pending,
  error,
  onOpen,
}: {
  branch: Branch;
  pending: boolean;
  error: unknown;
  onOpen: (openingFloat: number) => void;
}) {
  const { t } = useT();
  const [float, setFloat] = useState("1000");
  const amount = toNumber(float);

  return (
    <div className="grid min-h-full place-items-center p-4">
      <div className="w-full max-w-md space-y-5 rounded-3xl border border-line bg-white p-6 shadow-sm">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-light text-brand">
          <Wallet className="h-7 w-7" aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold text-ink">{t("Open the cash drawer")}</h1>
          <p className="text-muted">
            {t(
              "Do this once at the start of your shift. Count the cash in the {branch} drawer and enter it below, so the cash can be checked when you close the drawer.",
              { branch: branch.name },
            )}
          </p>
        </div>
        <label className="block font-bold text-ink">
          {t("Starting cash")}
          <Input
            inputMode="decimal"
            value={float}
            onChange={(e) => setFloat(e.target.value.replace(/[^\d.]/g, ""))}
            className="mt-1 h-14 text-2xl font-extrabold tabular-nums"
          />
        </label>
        <div className="grid grid-cols-3 gap-2">
          {[500, 1000, 2000].map((amt) => (
            <Button key={amt} variant="secondary" onClick={() => setFloat(String(amt))} className="tabular-nums">
              {formatPeso(amt)}
            </Button>
          ))}
        </div>
        {Boolean(error) && <p role="alert" className="text-sm text-danger">{toErrorMessage(error)}</p>}
        <Button size="xl" className="w-full" disabled={pending} onClick={() => onOpen(amount)}>
          {t("Open drawer with {amount}", { amount: formatPeso(amount) })}
        </Button>

        {/* A drawer is only needed to sell; checking on a branch never needs one. */}
        <div className="space-y-3 border-t border-line pt-4">
          <p className="text-sm text-muted">
            <span className="font-bold text-ink">{t("Just monitoring?")}</span>{" "}
            {t("You don't need to open a drawer to see this branch's sales and stock.")}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Link to="/dashboard" className={buttonVariants({ variant: "secondary" })}>
              <BarChart3 className="h-5 w-5" aria-hidden /> {t("Today's sales")}
            </Link>
            <Link to="/inventory" className={buttonVariants({ variant: "secondary" })}>
              <Package className="h-5 w-5" aria-hidden /> {t("Stock")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
