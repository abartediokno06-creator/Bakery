import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useBranch } from "@/context/BranchContext";
import { useAuth } from "@/context/AuthContext";
import { useShift } from "@/hooks/useShift";
import { supabase, toErrorMessage } from "@/lib/supabase";
import { formatPeso, toNumber } from "@/lib/utils";
import type { ShiftReport } from "@/types/domain";

const METHOD_LABEL = { cash: "Cash", gcash: "GCash", qrph: "QR Ph", card: "Card" } as const;

function ReportTable({ report, title }: { report: ShiftReport; title: string }) {
  const rows: Array<[string, number]> = [
    ["Opening float", report.opening_float],
    ["Gross sales", report.gross_sales],
    ["Discounts", -report.discounts],
    ["Net sales", report.net_sales],
    ...report.by_method.map((m): [string, number] => [`${METHOD_LABEL[m.payment_method]} (${m.txn_count})`, m.amount]),
    ["Pay-ins", report.pay_in],
    ["Pay-outs", -report.pay_out],
    ["Cash drops", -report.cash_drop],
    ["Expected cash in drawer", report.expected_cash],
  ];
  if (report.closing_count !== undefined) rows.push(["Counted cash", report.closing_count]);
  if (report.variance !== undefined) rows.push(["Over / short", report.variance]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <span className="text-sm text-muted">{new Date(report.generated_at).toLocaleString("en-PH")}</span>
      </CardHeader>
      <CardBody>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-line">
            {rows.map(([label, value]) => (
              <tr key={label}>
                <td className="py-2 text-muted">{label}</td>
                <td className="py-2 text-right font-semibold tabular-nums">{formatPeso(value)}</td>
              </tr>
            ))}
            <tr>
              <td className="py-2 text-muted">Sales / voids</td>
              <td className="py-2 text-right font-semibold tabular-nums">
                {report.txn_count} / {report.void_count}
              </td>
            </tr>
          </tbody>
        </table>
      </CardBody>
    </Card>
  );
}

export function DrawerPage() {
  const { activeBranch } = useBranch();
  if (!activeBranch) return <p className="p-8 text-muted">Pick a branch in the top bar first.</p>;
  return <Drawer branchId={activeBranch.id} />;
}

function Drawer({ branchId }: { branchId: string }) {
  const { user } = useAuth();
  const { shift, close, xReport } = useShift(branchId);
  const [report, setReport] = useState<{ data: ShiftReport; title: string } | null>(null);
  const [count, setCount] = useState("");
  const [eventKind, setEventKind] = useState<"pay_in" | "pay_out" | "cash_drop">("pay_out");
  const [eventAmount, setEventAmount] = useState("");
  const [eventNote, setEventNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const drawerEvent = useMutation({
    mutationFn: async () => {
      if (!shift) throw new Error("No open drawer");
      const { error: e } = await supabase.from("cash_drawer_events").insert({
        shift_id: shift.id,
        kind: eventKind,
        amount: toNumber(eventAmount),
        note: eventNote || null,
        created_by: user?.id ?? null,
      });
      if (e) throw e;
    },
    onSuccess: () => {
      setEventAmount("");
      setEventNote("");
    },
  });

  if (!shift && !report) {
    return <p className="p-8 text-muted">No open drawer. Open one from the Sell screen.</p>;
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-4 p-4 md:grid-cols-2">
      {shift && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Drawer opened {new Date(shift.opened_at).toLocaleTimeString("en-PH")}</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              <Button
                variant="secondary"
                className="w-full"
                onClick={async () => {
                  try {
                    setReport({ data: await xReport(shift.id), title: "X report (shift so far)" });
                  } catch (e) {
                    setError(toErrorMessage(e));
                  }
                }}
              >
                Print X report
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>Cash in / out</CardTitle></CardHeader>
            <CardBody className="space-y-3">
              <select
                value={eventKind}
                onChange={(e) => setEventKind(e.target.value as typeof eventKind)}
                className="h-11 w-full rounded-lg border border-line bg-white px-3"
                aria-label="Type"
              >
                <option value="pay_out">Pay-out (supplier, expense)</option>
                <option value="pay_in">Pay-in (added change)</option>
                <option value="cash_drop">Cash drop (to safe)</option>
              </select>
              <Input inputMode="decimal" placeholder="Amount" value={eventAmount} onChange={(e) => setEventAmount(e.target.value)} />
              <Input placeholder="Note (e.g. ice supplier)" value={eventNote} onChange={(e) => setEventNote(e.target.value)} />
              <Button className="w-full" disabled={toNumber(eventAmount) <= 0 || drawerEvent.isPending} onClick={() => drawerEvent.mutate()}>
                Record {formatPeso(toNumber(eventAmount))}
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>Close drawer (Z report)</CardTitle></CardHeader>
            <CardBody className="space-y-3">
              <Input inputMode="decimal" placeholder="Counted cash" value={count} onChange={(e) => setCount(e.target.value)} />
              <Button
                variant="danger"
                className="w-full"
                disabled={count === "" || close.isPending}
                onClick={() =>
                  close.mutate(
                    { shiftId: shift.id, closingCount: toNumber(count) },
                    {
                      onSuccess: (closed) =>
                        setReport({ data: closed.z_report as unknown as ShiftReport, title: "Z report (end of day)" }),
                      onError: (e) => setError(toErrorMessage(e)),
                    },
                  )
                }
              >
                Close drawer
              </Button>
            </CardBody>
          </Card>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        </div>
      )}
      {report && <ReportTable report={report.data} title={report.title} />}
    </div>
  );
}
