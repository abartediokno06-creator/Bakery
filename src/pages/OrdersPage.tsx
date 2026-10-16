import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Phone, Plus } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PickBranch } from "@/components/layout/PickBranch";
import { METHOD_META } from "@/components/pos/POSCheckout";
import { useBranch } from "@/context/BranchContext";
import { useShift } from "@/hooks/useShift";
import { formatDateTime, manilaDay } from "@/lib/dates";
import { useT } from "@/lib/i18n";
import { supabase, toErrorMessage } from "@/lib/supabase";
import { cn, formatPeso, toNumber } from "@/lib/utils";
import type { Branch, OrderStatus, PaymentMethod, SpecialOrder } from "@/types/domain";

const STATUS: Record<OrderStatus, { label: string; tone: NonNullable<BadgeProps["tone"]> }> = {
  pending: { label: "Pending", tone: "warn" },
  ready: { label: "Ready", tone: "brand" },
  picked_up: { label: "Picked up", tone: "good" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

const TABS: ReadonlyArray<{ id: string; label: string; statuses: OrderStatus[] }> = [
  { id: "upcoming", label: "Upcoming", statuses: ["pending", "ready"] },
  { id: "done", label: "Picked up", statuses: ["picked_up"] },
  { id: "cancelled", label: "Cancelled", statuses: ["cancelled"] },
];

const PAY_METHODS: readonly PaymentMethod[] = ["cash", "gcash", "qrph"];

const TEXTAREA =
  "mt-1 block w-full rounded-xl border border-line bg-white px-3 py-2 text-base text-ink placeholder:text-muted focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

export function OrdersPage() {
  const { t } = useT();
  const { activeBranch } = useBranch();
  if (!activeBranch) return <PickBranch purpose={t("Cakes and bulk orders with a deposit and pickup date.")} />;
  return <Orders key={activeBranch.id} branch={activeBranch} />;
}

function Orders({ branch }: { branch: Branch }) {
  const { t } = useT();
  const [tab, setTab] = useState(TABS[0]!.id);
  const [creating, setCreating] = useState(false);
  const statuses = TABS.find((x) => x.id === tab)?.statuses ?? ["pending", "ready"];

  const orders = useQuery({
    queryKey: ["special-orders", branch.id, tab],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_special_orders")
        .select("*")
        .eq("branch_id", branch.id)
        .in("status", statuses)
        .order("pickup_at", { ascending: tab === "upcoming" })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-3 sm:p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">{t("Special orders")}</h1>
          <p className="text-muted">{t("Cakes and bulk orders with a deposit and pickup date.")}</p>
        </div>
        {!creating && (
          <Button size="lg" onClick={() => setCreating(true)}>
            <Plus className="h-5 w-5" aria-hidden /> {t("New order")}
          </Button>
        )}
      </div>

      {creating && <NewOrderForm branch={branch} onDone={() => setCreating(false)} />}

      <div className="flex gap-2" role="tablist">
        {TABS.map((x) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={tab === x.id}
            onClick={() => setTab(x.id)}
            className={cn(
              "h-11 rounded-full px-4 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
              tab === x.id ? "bg-brand text-white" : "border border-line bg-white text-ink hover:bg-brand-light",
            )}
          >
            {t(x.label)}
          </button>
        ))}
      </div>

      {orders.isLoading ? (
        <p className="text-muted">…</p>
      ) : orders.error ? (
        <p role="alert" className="text-danger">{toErrorMessage(orders.error)}</p>
      ) : (orders.data ?? []).length === 0 ? (
        <Card>
          <CardBody className="py-10 text-center text-muted">{t("No orders here.")}</CardBody>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {(orders.data ?? []).map((o) => (
            <OrderCard key={o.id} order={o} branchId={branch.id} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Shows whether cash will land in the person's open drawer at this branch. */
function DrawerNote({ branchId }: { branchId: string }) {
  const { t } = useT();
  const { shift } = useShift(branchId);
  return shift ? (
    <p className="text-sm text-muted">{t("Cash goes into your open drawer.")}</p>
  ) : (
    <p className="text-sm font-semibold text-amber">
      {t("You have no open drawer here, so this cash will not be counted in a drawer.")}
    </p>
  );
}

function MethodPicker({ value, onChange }: { value: PaymentMethod; onChange: (m: PaymentMethod) => void }) {
  const { t } = useT();
  return (
    <div role="radiogroup" aria-label={t("Paid by")} className="grid grid-cols-3 gap-2">
      {PAY_METHODS.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={value === m}
          onClick={() => onChange(m)}
          className={cn(
            "h-11 rounded-xl border-2 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
            value === m ? "border-brand bg-brand-light text-brand-dark" : "border-line bg-white text-ink hover:border-brand/50",
          )}
        >
          {t(METHOD_META[m].label)}
        </button>
      ))}
    </div>
  );
}

/** Tomorrow 9:00 AM in the device's local time, formatted for <input type="datetime-local">. */
function defaultPickup(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T09:00`;
}

function NewOrderForm({ branch, onDone }: { branch: Branch; onDone: () => void }) {
  const { t } = useT();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [items, setItems] = useState("");
  const [price, setPrice] = useState("");
  const [pickup, setPickup] = useState(defaultPickup);
  const [deposit, setDeposit] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [ref, setRef] = useState("");
  const [notes, setNotes] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("create_special_order", {
        p_branch_id: branch.id,
        p_customer_name: name,
        p_customer_phone: phone || null,
        p_items: items,
        p_total: toNumber(price),
        p_pickup_at: new Date(pickup).toISOString(),
        p_notes: notes || null,
        p_deposit: toNumber(deposit),
        p_deposit_method: method,
        p_deposit_ref: ref || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["special-orders"] });
      onDone();
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  const hasDeposit = toNumber(deposit) > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("New order")}</CardTitle>
      </CardHeader>
      <CardBody>
        <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-bold text-ink">
            {t("Customer name")}
            <Input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </label>
          <label className="block text-sm font-bold text-ink">
            {t("Phone")}
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" />
          </label>
          <label className="block text-sm font-bold text-ink sm:col-span-2">
            {t("What they ordered")}
            <textarea
              required
              rows={3}
              value={items}
              onChange={(e) => setItems(e.target.value)}
              placeholder="1 Ube Roll, 'Happy Birthday Ana' · 200 pcs Pandesal"
              className={TEXTAREA}
            />
          </label>
          <label className="block text-sm font-bold text-ink">
            {t("Order price")}
            <Input required inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} className="mt-1 tabular-nums" />
          </label>
          <label className="block text-sm font-bold text-ink">
            {t("Pickup date and time")}
            <Input required type="datetime-local" value={pickup} onChange={(e) => setPickup(e.target.value)} className="mt-1" />
          </label>
          <label className="block text-sm font-bold text-ink">
            {t("Deposit now")}
            <Input inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" className="mt-1 tabular-nums" />
          </label>
          <div className="space-y-1 text-sm font-bold text-ink">
            {t("Paid by")}
            <MethodPicker value={method} onChange={setMethod} />
          </div>
          {hasDeposit && method !== "cash" && (
            <label className="block text-sm font-bold text-ink">
              {t("{method} reference no.", { method: METHOD_META[method].label })}
              <Input required value={ref} onChange={(e) => setRef(e.target.value)} className="mt-1" />
            </label>
          )}
          {hasDeposit && method === "cash" && (
            <div className="sm:col-span-2">
              <DrawerNote branchId={branch.id} />
            </div>
          )}
          <label className="block text-sm font-bold text-ink sm:col-span-2">
            {t("Notes")}
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" />
          </label>
          {create.error && <p role="alert" className="text-sm text-danger sm:col-span-2">{toErrorMessage(create.error)}</p>}
          <div className="grid grid-cols-2 gap-2 sm:col-span-2">
            <Button variant="secondary" onClick={onDone}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {t("Save order")}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function OrderCard({ order, branchId }: { order: SpecialOrder; branchId: string }) {
  const { t } = useT();
  const qc = useQueryClient();
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState(String(order.balance));
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [ref, setRef] = useState("");
  const refresh = () => void qc.invalidateQueries({ queryKey: ["special-orders"] });

  const setStatus = useMutation({
    mutationFn: async (status: OrderStatus) => {
      const { error } = await supabase.rpc("set_special_order_status", { p_order_id: order.id, p_status: status });
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const pay = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("pay_special_order", {
        p_order_id: order.id,
        p_amount: toNumber(amount),
        p_method: method,
        p_ref: ref || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setPaying(false);
      setRef("");
      refresh();
    },
  });

  const open = order.status === "pending" || order.status === "ready";
  const pickupDay = manilaDay(new Date(order.pickup_at));
  const today = manilaDay();
  const overdue = open && new Date(order.pickup_at).getTime() < Date.now();
  const s = STATUS[order.status];
  const error = setStatus.error ?? pay.error;

  return (
    <Card className={cn(overdue && "border-danger/50")}>
      <CardBody className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-lg font-extrabold text-ink">{order.customer_name}</p>
            <p className="text-sm text-muted">{order.order_no}</p>
          </div>
          <Badge tone={s.tone}>{t(s.label)}</Badge>
        </div>

        <p className="whitespace-pre-wrap rounded-xl bg-surface px-3 py-2 text-ink">{order.items}</p>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span className={cn("flex items-center gap-1 font-bold", overdue ? "text-danger" : pickupDay === today ? "text-brand-dark" : "text-ink")}>
            <CalendarClock className="h-4 w-4" aria-hidden /> {formatDateTime(order.pickup_at)}
          </span>
          {order.customer_phone && (
            <a href={`tel:${order.customer_phone}`} className="flex items-center gap-1 font-bold text-brand hover:underline">
              <Phone className="h-4 w-4" aria-hidden /> {order.customer_phone}
            </a>
          )}
        </div>
        {order.notes && <p className="text-sm text-muted">{order.notes}</p>}

        <dl className="grid grid-cols-3 gap-2 rounded-xl border border-line p-2 text-center">
          <div>
            <dt className="text-xs font-bold text-muted">{t("Total")}</dt>
            <dd className="font-extrabold tabular-nums">{formatPeso(order.total)}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold text-muted">{t("Paid")}</dt>
            <dd className="font-extrabold tabular-nums text-brand-dark">{formatPeso(order.paid)}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold text-muted">{t("Balance")}</dt>
            <dd className={cn("font-extrabold tabular-nums", order.balance > 0 ? "text-danger" : "text-muted")}>
              {formatPeso(order.balance)}
            </dd>
          </div>
        </dl>

        {paying && (
          <form
            className="space-y-2 rounded-2xl border border-line bg-surface p-3"
            onSubmit={(e) => {
              e.preventDefault();
              pay.mutate();
            }}
          >
            <label className="block text-sm font-bold text-ink">
              {t("Amount")}
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} className="mt-1 tabular-nums" />
            </label>
            <MethodPicker value={method} onChange={setMethod} />
            {method !== "cash" ? (
              <Input required value={ref} onChange={(e) => setRef(e.target.value)} placeholder={t("{method} reference no.", { method: METHOD_META[method].label })} />
            ) : (
              <DrawerNote branchId={branchId} />
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setPaying(false)}>
                {t("Back")}
              </Button>
              <Button type="submit" disabled={toNumber(amount) <= 0 || pay.isPending}>
                {t("Save")}
              </Button>
            </div>
          </form>
        )}

        {error && <p role="alert" className="text-sm text-danger">{toErrorMessage(error)}</p>}

        {open && !paying && (
          <div className="flex flex-wrap gap-2">
            {order.balance > 0 && (
              <Button
                size="sm"
                onClick={() => {
                  setAmount(String(order.balance)); // default to paying the rest
                  setPaying(true);
                }}
              >
                {t("Record payment")}
              </Button>
            )}
            {order.status === "pending" && (
              <Button size="sm" variant="secondary" disabled={setStatus.isPending} onClick={() => setStatus.mutate("ready")}>
                {t("Mark ready")}
              </Button>
            )}
            {order.balance <= 0 && (
              <Button size="sm" disabled={setStatus.isPending} onClick={() => setStatus.mutate("picked_up")}>
                {t("Mark picked up")}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="text-danger hover:bg-danger/10"
              disabled={setStatus.isPending}
              onClick={() => {
                if (window.confirm(t("Cancel this order? Refund any deposit from the drawer as a pay-out."))) setStatus.mutate("cancelled");
              }}
            >
              {t("Cancel order")}
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
