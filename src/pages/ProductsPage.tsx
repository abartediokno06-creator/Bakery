import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useBranch } from "@/context/BranchContext";
import { supabase, toErrorMessage } from "@/lib/supabase";
import { cn, formatPeso, toNumber } from "@/lib/utils";
import type { Enums } from "@/types/database.types";
import type { Product } from "@/types/domain";

type Kind = Enums<"item_kind">;

const KIND_LABEL: Record<Kind, string> = {
  finished_good: "Baked goods",
  ingredient: "Ingredients",
  packaging: "Packaging",
};
const UNITS = ["pc", "pack", "box", "cup", "tray", "kg", "g", "L", "mL"];
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

/** Turns database errors into something the owner can act on. */
function friendlyError(err: unknown): string {
  const msg = toErrorMessage(err);
  if (msg.includes("products_sku_key")) return "That SKU is already used by another product.";
  if (msg.includes("products_barcode_key")) return "That barcode is already used by another product.";
  return msg;
}

export function ProductsPage() {
  const { can } = useBranch();
  const [kind, setKind] = useState<Kind>("finished_good");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  // Remount the form only when a different product is opened, not after saving.
  const [formKey, setFormKey] = useState(0);
  const open = (p: Product | "new") => {
    setEditing(p);
    setFormKey((k) => k + 1);
  };

  const products = useQuery({
    queryKey: ["catalog"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const all = products.data ?? [];
  const categories = useMemo(() => [...new Set(all.map((p) => p.category))].sort(), [all]);
  const q = search.trim().toLowerCase();
  const visible = all.filter(
    (p) =>
      p.kind === kind &&
      (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.barcode ?? "").includes(q)),
  );

  if (!can("catalog.manage")) return <p className="p-8 text-muted">Only the owner can manage products.</p>;

  return (
    <div className="grid gap-4 p-3 sm:p-4 xl:grid-cols-[1fr_440px]">
      <Card className="min-w-0">
        <CardHeader>
          <div>
            <CardTitle>Products</CardTitle>
            <p className="text-sm text-muted">Shared by all branches. Prices can differ per branch.</p>
          </div>
          <Button onClick={() => open("new")}>
            <Plus className="h-5 w-5" aria-hidden /> New product
          </Button>
        </CardHeader>
        <div className="space-y-3 border-b border-line px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, SKU or barcode" aria-label="Search products" className="pl-10" />
          </div>
          <div className="flex gap-2 overflow-x-auto" role="tablist">
            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
              <button
                key={k}
                role="tab"
                aria-selected={kind === k}
                onClick={() => setKind(k)}
                className={cn(
                  "h-10 shrink-0 rounded-full px-4 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                  kind === k ? "bg-brand text-white" : "text-muted hover:bg-brand-light hover:text-brand-dark",
                )}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
        {products.isLoading ? (
          <p className="p-6 text-muted">Loading…</p>
        ) : products.error ? (
          <p role="alert" className="p-6 text-danger">{toErrorMessage(products.error)}</p>
        ) : visible.length === 0 ? (
          <p className="px-4 py-10 text-center text-muted">No products here yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {visible.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => open(p)}
                  aria-current={editing !== "new" && editing?.id === p.id}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-brand-light/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand",
                    editing !== "new" && editing?.id === p.id && "bg-brand-light",
                  )}
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-brand-light text-xs font-extrabold text-brand">
                    {p.image_url ? <img src={p.image_url} alt="" className="h-full w-full object-cover" /> : p.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-ink">{p.name}</span>
                    <span className="block truncate text-sm text-muted">
                      {p.sku} · {p.category}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <span className="font-extrabold tabular-nums">{p.kind === "finished_good" ? formatPeso(p.price) : `${formatPeso(p.cost)} cost`}</span>
                    {!p.is_active && <Badge tone="neutral">Off</Badge>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="space-y-4">
        {editing ? (
          <ProductForm
            key={formKey}
            product={editing === "new" ? null : editing}
            defaultKind={kind}
            categories={categories}
            onSaved={(p) => setEditing(p)}
            onClose={() => setEditing(null)}
          />
        ) : (
          <Card>
            <CardBody className="py-10 text-center text-muted">Pick a product to edit it, or add a new one.</CardBody>
          </Card>
        )}
        {editing && editing !== "new" && <BranchPrices product={editing} />}
      </div>
    </div>
  );
}

function ProductForm({
  product,
  defaultKind,
  categories,
  onSaved,
  onClose,
}: {
  product: Product | null;
  defaultKind: Kind;
  categories: string[];
  onSaved: (p: Product) => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(product?.name ?? "");
  const [category, setCategory] = useState(product?.category ?? "");
  const [kind, setKind] = useState<Kind>(product?.kind ?? defaultKind);
  const [unit, setUnit] = useState(product?.unit ?? "pc");
  const [price, setPrice] = useState(product ? String(product.price) : "");
  const [cost, setCost] = useState(product ? String(product.cost) : "");
  const [sku, setSku] = useState(product?.sku ?? "");
  const [barcode, setBarcode] = useState(product?.barcode ?? "");
  const [sellable, setSellable] = useState(product?.is_sellable ?? defaultKind === "finished_good");
  const [active, setActive] = useState(product?.is_active ?? true);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState(false);
  const [createdNew, setCreatedNew] = useState(false);

  // Suggest a SKU from the name for new products (editable).
  const suggestedSku = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 20);

  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const save = useMutation({
    mutationFn: async () => {
      const fields = {
        name: name.trim(),
        category: category.trim() || "Uncategorized",
        kind,
        unit: unit.trim() || "pc",
        price: kind === "finished_good" ? toNumber(price) : 0,
        cost: toNumber(cost),
        sku: (sku.trim() || suggestedSku).toUpperCase(),
        barcode: barcode.trim() || null,
        is_sellable: kind === "finished_good" && sellable,
        is_active: active,
      };
      const res = product
        ? await supabase.from("products").update(fields).eq("id", product.id).select().single()
        : await supabase.from("products").insert(fields).select().single();
      if (res.error) throw res.error;
      let saved = res.data;

      if (photo) {
        const ext = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
        const path = `${saved.id}/${Date.now()}.${ext}`;
        const up = await supabase.storage.from("product-images").upload(path, photo, { contentType: photo.type, upsert: true });
        if (up.error) throw up.error;
        const url = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
        const withPhoto = await supabase.from("products").update({ image_url: url }).eq("id", saved.id).select().single();
        if (withPhoto.error) throw withPhoto.error;
        saved = withPhoto.data;
      }
      return saved;
    },
    onSuccess: (saved) => {
      void qc.invalidateQueries({ queryKey: ["catalog"] });
      void qc.invalidateQueries({ queryKey: ["branch-inventory"] });
      setPhoto(null);
      setSavedNote(true);
      if (!product) setCreatedNew(true);
      onSaved(saved);
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSavedNote(false);
    save.mutate();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{product ? "Edit product" : "New product"}</CardTitle>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </CardHeader>
      <CardBody>
        <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-3 sm:col-span-2">
            <span className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-brand-light text-brand">
              {preview || product?.image_url ? (
                <img src={preview ?? product?.image_url ?? ""} alt="" className="h-full w-full object-cover" />
              ) : (
                <ImagePlus className="h-8 w-8" aria-hidden />
              )}
            </span>
            <label className="text-sm font-bold text-ink">
              Photo (JPG, PNG or WebP, up to 2 MB)
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="mt-1 block w-full text-sm file:mr-3 file:h-10 file:rounded-xl file:border-0 file:bg-brand file:px-3 file:font-bold file:text-white"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setPhotoError(null);
                  if (f && f.size > MAX_PHOTO_BYTES) {
                    setPhotoError("That photo is over 2 MB. Pick a smaller one.");
                    setPhoto(null);
                    e.target.value = "";
                    return;
                  }
                  setPhoto(f);
                }}
              />
              {photoError && <span role="alert" className="mt-1 block text-danger">{photoError}</span>}
            </label>
          </div>

          <label className="block text-sm font-bold text-ink sm:col-span-2">
            Name
            <Input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </label>
          <label className="block text-sm font-bold text-ink">
            Type
            <Select value={kind} onChange={(e) => setKind(e.target.value as Kind)} className="mt-1">
              {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          </label>
          <label className="block text-sm font-bold text-ink">
            Category
            <Input list="product-categories" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Bread" className="mt-1" />
            <datalist id="product-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          {kind === "finished_good" && (
            <label className="block text-sm font-bold text-ink">
              Selling price
              <Input required inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} className="mt-1 tabular-nums" />
            </label>
          )}
          <label className="block text-sm font-bold text-ink">
            Cost
            <Input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" className="mt-1 tabular-nums" />
          </label>
          <label className="block text-sm font-bold text-ink">
            Unit
            <Input list="product-units" value={unit} onChange={(e) => setUnit(e.target.value)} className="mt-1" />
            <datalist id="product-units">
              {UNITS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </label>
          <label className="block text-sm font-bold text-ink">
            SKU
            <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder={suggestedSku || "BRD-PANDESAL"} className="mt-1 uppercase" />
          </label>
          <label className="block text-sm font-bold text-ink sm:col-span-2">
            Barcode (optional)
            <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} inputMode="numeric" className="mt-1" />
          </label>
          {kind === "finished_good" && (
            <label className="flex items-center gap-2 text-sm font-bold text-ink">
              <input type="checkbox" checked={sellable} onChange={(e) => setSellable(e.target.checked)} className="h-5 w-5 accent-[#096B38]" />
              Show on the Sell screen
            </label>
          )}
          <label className="flex items-center gap-2 text-sm font-bold text-ink">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-5 w-5 accent-[#096B38]" />
            Active (turn off to hide everywhere)
          </label>

          {save.error && <p role="alert" className="text-sm text-danger sm:col-span-2">{friendlyError(save.error)}</p>}
          {savedNote && !save.isPending && (
            <p role="status" className="text-sm font-bold text-leaf sm:col-span-2">
              Saved. {createdNew ? "It now appears at every branch with 0 in stock." : ""}
            </p>
          )}
          <Button type="submit" size="lg" className="sm:col-span-2" disabled={save.isPending || !name.trim()}>
            {save.isPending ? "Saving..." : product ? "Save changes" : "Add product"}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

/** Per-branch selling price (blank = use the main price) and reorder level. */
function BranchPrices({ product }: { product: Product }) {
  const qc = useQueryClient();
  const { branches } = useBranch();
  const names = new Map(branches.map((b) => [b.branch.id, b.branch.name]));
  const [edits, setEdits] = useState<Record<string, { price: string; reorder: string }>>({});
  const [done, setDone] = useState(false);

  const rows = useQuery({
    queryKey: ["branch-prices", product.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branch_inventory")
        .select("id, branch_id, quantity, price_override, reorder_level")
        .eq("product_id", product.id);
      if (error) throw error;
      return data.sort((a, b) => (names.get(a.branch_id) ?? "").localeCompare(names.get(b.branch_id) ?? ""));
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      for (const [id, e] of Object.entries(edits)) {
        const { error } = await supabase
          .from("branch_inventory")
          .update({ price_override: e.price.trim() === "" ? null : toNumber(e.price), reorder_level: toNumber(e.reorder) })
          .eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      setEdits({});
      setDone(true);
      void qc.invalidateQueries({ queryKey: ["branch-prices", product.id] });
      void qc.invalidateQueries({ queryKey: ["branch-inventory"] });
    },
  });

  const valueOf = (r: { id: string; price_override: number | null; reorder_level: number }) =>
    edits[r.id] ?? { price: r.price_override === null ? "" : String(r.price_override), reorder: String(r.reorder_level) };

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Branch prices and reorder levels</CardTitle>
          <p className="text-sm text-muted">
            Leave the price blank to use {formatPeso(product.price)}. Low-stock alerts start at the reorder level.
          </p>
        </div>
      </CardHeader>
      {rows.isLoading ? (
        <CardBody className="text-muted">Loading…</CardBody>
      ) : (
        <ul className="divide-y divide-line">
          <li className="grid grid-cols-[1fr_96px_84px] gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wide text-muted">
            <span>Branch</span>
            <span className="text-right">Price</span>
            <span className="text-right">Reorder at</span>
          </li>
          {(rows.data ?? []).map((r) => {
            const v = valueOf(r);
            const set = (patch: Partial<{ price: string; reorder: string }>) => {
              setDone(false);
              setEdits((all) => ({ ...all, [r.id]: { ...v, ...patch } }));
            };
            return (
              <li key={r.id} className="grid grid-cols-[1fr_96px_84px] items-center gap-2 px-4 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">{names.get(r.branch_id)}</span>
                  <span className="block text-xs text-muted">{r.quantity} in stock</span>
                </span>
                <Input
                  inputMode="decimal"
                  value={v.price}
                  placeholder={String(product.price)}
                  aria-label={`Price at ${names.get(r.branch_id)}`}
                  onChange={(e) => set({ price: e.target.value.replace(/[^\d.]/g, "") })}
                  className="h-10 text-right tabular-nums"
                />
                <Input
                  inputMode="decimal"
                  value={v.reorder}
                  aria-label={`Reorder level at ${names.get(r.branch_id)}`}
                  onChange={(e) => set({ reorder: e.target.value.replace(/[^\d.]/g, "") })}
                  className="h-10 text-right tabular-nums"
                />
              </li>
            );
          })}
        </ul>
      )}
      <CardBody className="space-y-2 border-t border-line">
        {save.error && <p role="alert" className="text-sm text-danger">{toErrorMessage(save.error)}</p>}
        {done && <p role="status" className="text-sm font-bold text-leaf">Branch prices saved.</p>}
        <Button className="w-full" disabled={Object.keys(edits).length === 0 || save.isPending} onClick={() => save.mutate()}>
          Save branch prices
        </Button>
      </CardBody>
    </Card>
  );
}
