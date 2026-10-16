import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PickBranch } from "@/components/layout/PickBranch";
import { useBranch } from "@/context/BranchContext";
import { useTransfers, type TransferLineInput } from "@/hooks/useTransfers";
import { supabase, toErrorMessage } from "@/lib/supabase";
import { toNumber } from "@/lib/utils";
import type { Branch, TransferStatus } from "@/types/domain";

const STATUS: Record<TransferStatus, { label: string; tone: NonNullable<BadgeProps["tone"]> }> = {
  requested: { label: "Requested", tone: "brand" },
  dispatched: { label: "On the way", tone: "warn" },
  received: { label: "Received", tone: "good" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export function TransfersPage() {
  const { activeBranch } = useBranch();
  if (!activeBranch) return <PickBranch purpose="Pick a branch to manage its transfers." />;
  return <Transfers branch={activeBranch} />;
}

function Transfers({ branch }: { branch: Branch }) {
  const { can } = useBranch();
  const t = useTransfers(branch.id);
  const [err, setErr] = useState<string | null>(null);
  const onError = (e: unknown) => setErr(toErrorMessage(e));

  return (
    <div className="grid gap-4 p-4 xl:grid-cols-[1fr_380px]">
      <Card className="min-w-0">
        <CardHeader><CardTitle>Transfers for {branch.name}</CardTitle></CardHeader>
        <ul className="divide-y divide-line">
          {t.transfers.map((tr) => {
            const outgoing = tr.from_branch_id === branch.id;
            const s = STATUS[tr.status];
            return (
              <li key={tr.id} className="space-y-2 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-bold">{tr.transfer_no}</p>
                    <p className="text-sm text-muted">
                      {tr.from_branch?.name} to {tr.to_branch?.name}
                    </p>
                  </div>
                  <Badge tone={s.tone}>{s.label}</Badge>
                </div>
                <ul className="text-sm">
                  {tr.items.map((it) => (
                    <li key={it.id} className="flex justify-between tabular-nums">
                      <span>{it.product?.name}</span>
                      <span className="text-muted">
                        {it.qty_requested} req
                        {it.qty_dispatched !== null && `, ${it.qty_dispatched} sent`}
                        {it.qty_received !== null && `, ${it.qty_received} rcvd`} {it.product?.unit}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  {outgoing && tr.status === "requested" && can("transfer.dispatch") && (
                    <Button size="sm" onClick={() => t.dispatch.mutate({ transferId: tr.id }, { onError })}>Dispatch</Button>
                  )}
                  {!outgoing && tr.status === "dispatched" && can("transfer.receive") && (
                    <Button size="sm" onClick={() => t.receive.mutate({ transferId: tr.id }, { onError })}>Mark received</Button>
                  )}
                  {tr.status === "requested" && can("inventory.adjust") && (
                    <Button size="sm" variant="secondary" onClick={() => t.cancel.mutate(tr.id, { onError })}>Cancel</Button>
                  )}
                </div>
              </li>
            );
          })}
          {!t.loading && t.transfers.length === 0 && (
            <li className="px-4 py-8 text-center text-muted">No transfers yet. Request stock from another branch to start one.</li>
          )}
        </ul>
        {err && <p role="alert" className="px-4 pb-4 text-sm text-danger">{err}</p>}
      </Card>

      {can("transfer.request") && <RequestForm branch={branch} onSubmit={(input) => t.request.mutateAsync(input)} />}
    </div>
  );
}

function RequestForm({
  branch,
  onSubmit,
}: {
  branch: Branch;
  onSubmit: (input: { fromBranchId: string; items: TransferLineInput[]; notes?: string }) => Promise<unknown>;
}) {
  const [fromId, setFromId] = useState("");
  const [lines, setLines] = useState<Array<TransferLineInput & { name: string }>>([]);
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("");
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  // All active branches are readable by staff (RLS branches_select) so they can pick a source.
  const branches = useQuery({
    queryKey: ["all-branches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return data.filter((b) => b.id !== branch.id);
    },
  });
  const products = useQuery({
    queryKey: ["products-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name, unit").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const addLine = () => {
    const p = products.data?.find((x) => x.id === productId);
    if (!p || toNumber(qty) <= 0) return;
    setLines((prev) => [...prev.filter((l) => l.product_id !== p.id), { product_id: p.id, qty: toNumber(qty), name: p.name }]);
    setProductId("");
    setQty("");
  };

  return (
    <Card>
      <CardHeader><CardTitle>Request stock</CardTitle></CardHeader>
      <CardBody className="space-y-3">
        <Select value={fromId} onChange={(e) => setFromId(e.target.value)} aria-label="From branch">
          <option value="">Send from which branch?</option>
          {branches.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
        <div className="flex gap-2">
          <Select value={productId} onChange={(e) => setProductId(e.target.value)} className="min-w-0 flex-1" aria-label="Item">
            <option value="">Item</option>
            {products.data?.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
          </Select>
          <Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Qty" className="w-20" aria-label="Quantity" />
          <Button variant="secondary" onClick={addLine}>Add</Button>
        </div>
        {lines.length > 0 && (
          <ul className="space-y-1 text-sm">
            {lines.map((l) => (
              <li key={l.product_id} className="flex justify-between">
                <span>{l.name}</span>
                <button className="tabular-nums text-muted hover:text-danger" onClick={() => setLines((p) => p.filter((x) => x.product_id !== l.product_id))}>
                  {l.qty} (remove)
                </button>
              </li>
            ))}
          </ul>
        )}
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Note for the sending branch" aria-label="Note" />
        <Button
          className="w-full"
          disabled={!fromId || lines.length === 0}
          onClick={async () => {
            try {
              await onSubmit({ fromBranchId: fromId, items: lines.map(({ product_id, qty: q }) => ({ product_id, qty: q })), notes });
              setLines([]);
              setNotes("");
              setMsg("Request sent.");
            } catch (e) {
              setMsg(toErrorMessage(e));
            }
          }}
        >
          Send request
        </Button>
        {msg && <p className="text-sm text-muted">{msg}</p>}
      </CardBody>
    </Card>
  );
}
