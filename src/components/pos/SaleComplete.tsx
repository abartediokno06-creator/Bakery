import { CircleCheck, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { METHOD_META, type CompletedSale } from "@/components/pos/POSCheckout";
import { useT } from "@/lib/i18n";
import { printReceipt } from "@/lib/printReceipt";
import { formatPeso } from "@/lib/utils";

/** Confirmation after a sale. Cash sales lead with the change to hand back. */
export function SaleComplete({ sale, onNewSale }: { sale: CompletedSale; onNewSale: () => void }) {
  const { t } = useT();
  return (
    <div role="status" className="flex flex-1 flex-col items-center justify-center gap-5 p-6 text-center">
      <CircleCheck className="h-16 w-16 text-brand" aria-hidden />
      <div>
        <h2 className="text-2xl font-extrabold text-ink">{t("Sale complete")}</h2>
        <p className="text-muted">
          {t("{amount} paid by {method}", { amount: formatPeso(sale.total), method: t(METHOD_META[sale.method].label) })}
        </p>
      </div>
      {sale.method === "cash" && (
        <div className="w-full rounded-2xl bg-brand-light p-5">
          <p className="text-sm font-bold uppercase tracking-wide text-brand-dark">{t("Give change")}</p>
          <p className="text-5xl font-extrabold tabular-nums text-brand-dark">{formatPeso(sale.changeDue)}</p>
        </div>
      )}
      <p className="text-sm text-muted">
        {sale.receiptNo
          ? t("Receipt no. {no}", { no: sale.receiptNo })
          : t("Saved on this device. It will upload when the internet is back.")}
      </p>
      <div className="grid w-full gap-2">
        <Button size="xl" className="w-full" onClick={onNewSale}>
          {t("Start new sale")}
        </Button>
        <Button variant="secondary" size="lg" className="w-full" onClick={() => printReceipt(sale.receipt)}>
          <Printer className="h-5 w-5" aria-hidden /> {t("Print receipt")}
        </Button>
      </div>
    </div>
  );
}
