import { CloudOff, RefreshCw, TriangleAlert, Wifi } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useSyncStore } from "@/stores/syncStore";

// Sits on the green header, so problem states use solid pills to stand out.
const PILL = "flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold";

export function SyncIndicator() {
  const { t } = useT();
  const online = useOnlineStatus();
  const { pending, failed, syncing, flush } = useSyncStore();

  if (failed > 0) {
    return (
      <span className={cn(PILL, "bg-danger text-white")} role="status">
        <TriangleAlert className="h-4 w-4" aria-hidden /> {t("{n} sale(s) need review", { n: failed })}
      </span>
    );
  }
  if (!online) {
    return (
      <span className={cn(PILL, "bg-gold text-ink")} role="status">
        <CloudOff className="h-4 w-4" aria-hidden />{" "}
        {pending > 0 ? t("Offline, {n} sale(s) saved on this device", { n: pending }) : t("Offline")}
      </span>
    );
  }
  if (pending > 0) {
    return (
      <button
        onClick={() => void flush()}
        className={cn(PILL, "bg-white text-brand-dark hover:bg-brand-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold")}
      >
        <RefreshCw className={syncing ? "h-4 w-4 animate-spin motion-reduce:animate-none" : "h-4 w-4"} aria-hidden />
        {t("Uploading {n} sale(s)", { n: pending })}
      </button>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-sm font-semibold text-white/85" role="status">
      <Wifi className="h-4 w-4" aria-hidden /> {t("Online")}
    </span>
  );
}
